import { Time, Timings, Try } from '@shared'
import { FileSystem, Path, WorkspaceWatch } from '@shared/os'
import type { UpdateResult } from './Workspace'

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
  const timings = request.input.kind === 'source' ? request.input.timings : new Timings('workspace:input')
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

/** isWithin checks path containment after resolving both paths. */
export function isWithin(root: string, path: string): boolean {
  const relative = Path.relative(Path.resolve(root), Path.resolve(path)).replaceAll('\\', '/')
  return relative === '' || (relative !== '..' && !relative.startsWith('../') && !relative.startsWith('/'))
}

/** readSource records source observation and disk reading before compilation begins. */
export async function readSource(
  path: string,
  observedAtMs: number,
  read: (path: string, observedAtMs: number) => Promise<SourceSnapshot | UpdateResult> = defaultRead,
): Promise<SourceSnapshot | UpdateResult> {
  const timings = new Timings('workspace:input')
  timings.record('workspace.observe-to-read', Time.nowMs() - Math.max(0, Time.timestampMs() - observedAtMs))
  const snapshot = await readWorkspaceSource(timings, path, observedAtMs, read)
  return 'status' in snapshot ? snapshot : { ...snapshot, timings }
}

/** failedResult creates a failed source-read or compiler result. */
export function failedResult(id: number, error: unknown, timings: Timings['samples']): UpdateResult {
  return {
    status: 'failed',
    revision: `r${id}`,
    error: String(error),
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
    timings: new Timings('workspace:input'),
  }))
}

function skippedStages(): Extract<UpdateResult, { status: 'failed' }>['stages'] {
  return {
    typecheck: { stage: 'typecheck', status: 'skipped' },
    fix: { stage: 'fix', status: 'skipped' },
    check: { stage: 'check', status: 'skipped' },
  }
}
