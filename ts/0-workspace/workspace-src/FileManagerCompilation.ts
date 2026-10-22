import { Time, Timings, Try } from '@shared'
import { FileSystem, Path, WorkspaceWatch } from '@shared/os'
import { Document } from './Document'
import { isSetupRequired } from './SetupRequired'
import type { UpdateResult } from './Workspace'

/** PipelineWatchDirectories tracks the replaceable authored and generated roots of a preview pipeline. */
export class PipelineWatchDirectories {
  private authored: string[] = []
  private snapshots: string[] = []

  constructor(private readonly options: Pick<FileManagerOptions, 'outputDirectory' | 'watchDirectories'>) {}

  update(root: string | undefined, authored: readonly string[], snapshots: readonly string[]): boolean {
    const nextAuthored = collectUniquePaths(authored).filter(path => !root || !Path.isWithin(root, path))
    const nextSnapshots = collectUniquePaths(snapshots)
    if (haveSamePaths(this.authored, nextAuthored) && haveSamePaths(this.snapshots, nextSnapshots)) {
      return false
    }
    this.authored = nextAuthored
    this.snapshots = nextSnapshots
    return true
  }

  additional(): string[] {
    return collectUniquePaths([...this.options.watchDirectories ?? [], ...this.authored])
  }

  ignored(): string[] {
    return collectUniquePaths([
      ...this.options.outputDirectory ? [this.options.outputDirectory] : [],
      ...this.snapshots,
    ])
  }

  ignores(path: string): boolean {
    return (this.options.outputDirectory !== undefined && Path.isWithin(this.options.outputDirectory, path))
      || this.snapshots.some(directory => Path.isWithin(directory, path))
  }
}

/** loadFileManagerInput captures a queued disk or immutable source input as a document snapshot. */
export async function loadFileManagerInput(
  request: Pending,
  documents: Map<string, Document>,
  read: FileManagerOptions['read'],
  isCurrent: () => boolean,
): Promise<LoadedSource | UpdateResult> {
  if (request.input.kind === 'source') {
    return {
      path: request.input.path,
      source: request.input.source,
      version: request.input.version,
      startedAtMs: request.input.startedAtMs,
      timings: request.input.timings,
    }
  }
  const snapshot = await readSource(request.input.path, request.input.startedAtMs, read)
  if ('status' in snapshot) {
    return snapshot
  }
  if (!isCurrent()) {
    return createSupersededResult(request.id)
  }
  const document = documents.get(request.input.path) ?? new Document(request.input.path)
  documents.set(request.input.path, document)
  const version = document.replaceSource(snapshot.source).version
  return {
    path: request.input.path,
    source: snapshot.source,
    version,
    startedAtMs: snapshot.observedAtMs,
    timings: snapshot.timings,
  }
}

/** FileManagerOptions connects source observation to the workspace compiler. */
export type FileManagerOptions = {
  directory?: string
  outputDirectory?: string
  watchDirectories?: readonly string[]
  debounceMs?: number
  compile(request: CompileRequest, isCurrent: () => boolean): Promise<UpdateResult>
  onSourceUpdate?: (result: UpdateResult) => void
  onSourceError?: (error: unknown) => void
  watch?: typeof WorkspaceWatch.watchWorkspace
  read?: (path: string, observedAtMs: number) => Promise<ReadResult>
  schedule?: (delayMs: number, callback: () => void) => () => void
}

/** CompiledEvent identifies the immutable source version associated with a completed compile. */
export type CompiledEvent = { path: string | undefined; source: string; version?: number; result: UpdateResult }

/** CompileRequest carries one frozen source snapshot and its timing state into Workspace compilation. */
export type CompileRequest = {
  id: number
  source: string
  path: string | undefined
  startedAtMs: number
  queuedAtMs: number
  timings: Timings
  version?: number
}

/** FileManagerInput holds either a frozen source or a disk read deferred until its queue turn. */
export type FileManagerInput =
  | {
    kind: 'source'
    source: string
    path: string | undefined
    version?: number
    startedAtMs: number
    timings: Timings
  }
  | { kind: 'disk'; path: string; startedAtMs: number }

/** QueuedInput adds the identity needed to report completed requests. */
export type QueuedInput = { id: number; input: FileManagerInput }

/** Pending records the queue generation and completion callback of a source request. */
export type Pending = QueuedInput & {
  entryGeneration: number | undefined
  observation: number
  queuedAtMs: number
  resolve(result: UpdateResult): void
}

/** LoadedSource carries a document snapshot and its source acquisition timings. */
export type LoadedSource = {
  path: string | undefined
  source: string
  version: number | undefined
  startedAtMs: number
  timings: Timings
}

/** CompletedInput carries request details through compile and publication callbacks. */
export type CompletedInput = {
  path: string | undefined
  source: string
  version: number | undefined
  result: UpdateResult
}

/** Refresh creates a waitable compile completion. */
export type Refresh = { promise: Promise<UpdateResult>; settle(result: UpdateResult): void }

/** createRefresh creates a waitable compile completion. */
export function createRefresh(): Refresh {
  let settle!: (result: UpdateResult) => void
  return { promise: new Promise(resolve => settle = resolve), settle }
}

/** resolveInputPath returns the selected file identity for a queued request. */
export function resolveInputPath(input: FileManagerInput): string | undefined {
  return input.path
}

/** createSupersededInput creates callback data for invalidated work. */
export function createSupersededInput(request: QueuedInput): CompletedInput {
  const source = request.input.kind === 'source' ? request.input.source : ''
  const version = request.input.kind === 'source' ? request.input.version : undefined
  return {
    result: createSupersededResult(request.id),
    path: resolveInputPath(request.input),
    source,
    version,
  }
}

/** createFailedInput creates callback data for errors raised while processing a request. */
export function createFailedInput(request: QueuedInput, error: unknown): CompletedInput {
  const source = request.input.kind === 'source' ? request.input.source : ''
  const version = request.input.kind === 'source' ? request.input.version : undefined
  const samples = request.input.kind === 'source' ? request.input.timings.samples : []
  return {
    result: createFailedResult(request.id, error, samples),
    path: resolveInputPath(request.input),
    source,
    version,
  }
}

/** isRelevantChange identifies watcher events that invalidate Tao compilation. */
export function isRelevantChange(change: WorkspaceWatch.WorkspaceChange): boolean {
  return change.kind === 'addDir' || change.kind === 'unlinkDir' || /\.(?:tao|tsx?|jsx?|json)$/.test(change.path)
}

/** createFailedResult creates a failed source-read or compiler result. */
export function createFailedResult(id: number, error: unknown, timings: Timings['samples']): UpdateResult {
  return {
    status: 'failed',
    revision: `r${id}`,
    error: String(error),
    setupRequired: isSetupRequired(error),
    timings,
    stages: createSkippedStages(),
  }
}

/** createSupersededResult creates a result for work invalidated before publication. */
export function createSupersededResult(id: number): UpdateResult {
  return { status: 'superseded', revision: `r${id}`, timings: [], stages: createSkippedStages() }
}

/** notifyCompletion isolates observer failures from compilation and reports them to the source error handler. */
export function notifyCompletion(
  options: FileManagerOptions,
  listeners: Iterable<(event: CompiledEvent) => void>,
  completed: CompletedInput,
): void {
  const report = (error: unknown) => Try.WithDefault(undefined, () => options.onSourceError?.(error))
  Try(() => options.onSourceUpdate?.(completed.result), { catch: report })
  for (const listener of listeners) {
    Try(() => listener(completed), { catch: report })
  }
}

type ReadResult = { source: string; observedAtMs: number } | UpdateResult
type SourceSnapshot = { source: string; observedAtMs: number; timings: Timings }

const readSource = Timings.createTopLevelTimer(async function(
  timings,
  path: string,
  observedAtMs: number,
  read: (path: string, observedAtMs: number) => Promise<ReadResult> = defaultRead,
): Promise<SourceSnapshot | UpdateResult> {
  timings.record('workspace.observe-to-read', Time.nowMs() - Math.max(0, Time.timestampMs() - observedAtMs))
  const snapshot = await timings.run(readWorkspaceSource, path, observedAtMs, read)
  return 'status' in snapshot ? snapshot : { ...snapshot, timings }
})

const readWorkspaceSource = Timings.measured('workspace.read', function(
  path: string,
  observedAtMs: number,
  read: (path: string, observedAtMs: number) => Promise<ReadResult>,
): Promise<ReadResult> {
  return read(path, observedAtMs).then(result => {
    if ('status' in result) {
      return result
    }
    return { source: result.source, observedAtMs }
  })
})

function defaultRead(path: string, observedAtMs: number): Promise<ReadResult> {
  return FileSystem.readFile(path, 'utf8').then(source => ({
    source,
    observedAtMs,
  }))
}

function collectUniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map(path => Path.resolve(path)))].sort()
}

function haveSamePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index])
}

function createSkippedStages(): Extract<UpdateResult, { status: 'failed' }>['stages'] {
  return {
    typecheck: { stage: 'typecheck', status: 'skipped' },
    fix: { stage: 'fix', status: 'skipped' },
    check: { stage: 'check', status: 'skipped' },
  }
}
