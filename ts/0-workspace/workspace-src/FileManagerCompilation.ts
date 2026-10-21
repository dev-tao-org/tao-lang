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
    const nextAuthored = uniquePaths(authored).filter(path => !root || !Path.isWithin(root, path))
    const nextSnapshots = uniquePaths(snapshots)
    if (samePaths(this.authored, nextAuthored) && samePaths(this.snapshots, nextSnapshots)) {
      return false
    }
    this.authored = nextAuthored
    this.snapshots = nextSnapshots
    return true
  }

  additional(): string[] {
    return uniquePaths([...this.options.watchDirectories ?? [], ...this.authored])
  }

  ignored(): string[] {
    return uniquePaths([...this.options.outputDirectory ? [this.options.outputDirectory] : [], ...this.snapshots])
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
    return supersededResult(request.id)
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
  read?: (path: string, observedAtMs: number) => Promise<SourceSnapshot | UpdateResult>
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

/** SourceSnapshot carries one disk read and its input timings into the compiler queue. */
export type SourceSnapshot = { source: string; observedAtMs: number; timings: Timings }

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

/** newRefresh creates a waitable compile completion. */
export function newRefresh(): Refresh {
  let settle!: (result: UpdateResult) => void
  return { promise: new Promise(resolve => settle = resolve), settle }
}

/** inputPath returns the selected file identity for a queued request. */
export function inputPath(input: FileManagerInput): string | undefined {
  return input.path
}

/** supersededInput creates callback data for invalidated work. */
export function supersededInput(request: QueuedInput): CompletedInput {
  const source = request.input.kind === 'source' ? request.input.source : ''
  const version = request.input.kind === 'source' ? request.input.version : undefined
  return {
    result: supersededResult(request.id),
    path: inputPath(request.input),
    source,
    version,
  }
}

/** failedInput creates callback data for errors raised while processing a request. */
export function failedInput(request: QueuedInput, error: unknown): CompletedInput {
  const source = request.input.kind === 'source' ? request.input.source : ''
  const version = request.input.kind === 'source' ? request.input.version : undefined
  const timings = request.input.kind === 'source' ? request.input.timings : new Timings()
  return {
    result: failedResult(request.id, error, timings.samples),
    path: inputPath(request.input),
    source,
    version,
  }
}

/** isRelevantChange identifies watcher events that invalidate Tao compilation. */
export function isRelevantChange(change: WorkspaceWatch.WorkspaceChange): boolean {
  return change.kind === 'addDir' || change.kind === 'unlinkDir' || /\.(?:tao|tsx?|jsx?|json)$/.test(change.path)
}

/** failedResult creates a failed source-read or compiler result. */
export function failedResult(id: number, error: unknown, timings: Timings['samples']): UpdateResult {
  return {
    status: 'failed',
    revision: `r${id}`,
    error: String(error),
    setupRequired: isSetupRequired(error),
    timings,
    stages: skippedStages(),
  }
}

/** supersededResult creates a result for work invalidated before publication. */
export function supersededResult(id: number): UpdateResult {
  return { status: 'superseded', revision: `r${id}`, timings: [], stages: skippedStages() }
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

async function readSource(
  path: string,
  observedAtMs: number,
  read: (path: string, observedAtMs: number) => Promise<SourceSnapshot | UpdateResult> = defaultRead,
): Promise<SourceSnapshot | UpdateResult> {
  const timings = new Timings()
  timings.record('workspace.observe-to-read', Time.nowMs() - Math.max(0, Time.timestampMs() - observedAtMs))
  const snapshot = await readWorkspaceSource(timings, path, observedAtMs, read)
  return 'status' in snapshot ? snapshot : { ...snapshot, timings }
}

const readWorkspaceSource = Timings.measure('workspace.read', function(
  path: string,
  observedAtMs: number,
  read: (path: string, observedAtMs: number) => Promise<SourceSnapshot | UpdateResult>,
): Promise<ReadResult> {
  return read(path, observedAtMs).then(result => {
    if ('status' in result) {
      return result
    }
    return { source: result.source, observedAtMs }
  })
})

function defaultRead(path: string, observedAtMs: number): Promise<SourceSnapshot> {
  return FileSystem.readFile(path, 'utf8').then(source => ({
    source,
    observedAtMs,
    timings: new Timings(),
  }))
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map(path => Path.resolve(path)))].sort()
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index])
}

function skippedStages(): Extract<UpdateResult, { status: 'failed' }>['stages'] {
  return {
    typecheck: { stage: 'typecheck', status: 'skipped' },
    fix: { stage: 'fix', status: 'skipped' },
    check: { stage: 'check', status: 'skipped' },
  }
}
