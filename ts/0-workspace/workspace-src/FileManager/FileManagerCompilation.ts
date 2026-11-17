import { Lists, Regxs, Sort, Time, Timings, Try } from '@shared'
import { FileWatch, FS, Path } from '@shared/os'
import { Document } from '../Document'
import { findNearestProjectRoot, resolveCanonicalPath } from '../modules/Paths'
import { isSetupRequired } from '../SetupRequired'
import type { UpdateResult } from '../Workspace'
import type { watchSourceTree } from './SourceWatch'

type PipelineWatchDirectoryOption = 'outputDirectory' | 'watchDirectories'

/** PipelineWatchDirectories tracks the replaceable authored and generated roots of a preview pipeline. */
export class PipelineWatchDirectories {
  private authored: string[] = []
  private files: string[] = []
  private snapshots: string[] = []
  private readonly outputDirectory: WorkspaceRoot

  constructor(private readonly options: Pick<FileManagerOptions, PipelineWatchDirectoryOption>) {
    this.outputDirectory = options.outputDirectory === undefined
      ? undefined
      : resolveCanonicalPath(options.outputDirectory)
  }

  update(
    root: WorkspaceRoot,
    authored: readonly string[],
    files: readonly string[],
    snapshots: readonly string[],
  ): boolean {
    const nextAuthored = collectUniquePaths(authored).filter(path => !root || !Path.isWithin(root, path))
    const nextFiles = collectUniquePaths(files)
    const nextSnapshots = collectUniquePaths(snapshots)
    if (haveSameWatchDirectories(this.authored, this.files, this.snapshots, nextAuthored, nextFiles, nextSnapshots)) {
      return false
    }
    this.authored = nextAuthored
    this.files = nextFiles
    this.snapshots = nextSnapshots
    return true
  }

  watchesFile(path: string): boolean {
    return this.files.includes(Path.resolve(path))
  }

  includeFiles(root: WorkspaceRoot, paths: readonly string[]): boolean {
    const nextFiles = collectUniquePaths([...this.files, ...paths])
    const projectRoots = paths.flatMap(resolveAttemptedFileProject)
    const externalRoots = projectRoots.filter(path => !root || !Path.isWithin(root, path))
    const nextAuthored = collectUniquePaths([...this.authored, ...externalRoots])
    if (haveSamePaths(this.files, nextFiles) && haveSamePaths(this.authored, nextAuthored)) {
      return false
    }
    this.files = nextFiles
    this.authored = nextAuthored
    return true
  }

  additional(): string[] {
    return collectUniquePaths([...this.options.watchDirectories ?? [], ...this.authored])
  }

  ignored(): string[] {
    return collectUniquePaths([
      ...this.outputDirectory ? [this.outputDirectory] : [],
      ...this.snapshots,
    ])
  }

  ignores(path: string): boolean {
    return (this.outputDirectory !== undefined && Path.isWithin(this.outputDirectory, path))
      || this.snapshots.some(directory => Path.isWithin(directory, path))
  }
}

type LoadedInputResult = LoadedSource | UpdateResult
/** loadFileManagerInput captures a queued disk or immutable source input as a document snapshot. */
export async function loadFileManagerInput(
  request: Pending,
  documents: Map<string, Document>,
  isCurrent: () => boolean,
): Promise<LoadedInputResult> {
  if (request.input.kind === 'source') {
    return {
      path: request.input.path,
      source: request.input.source,
      version: request.input.version,
      startedAtMs: request.input.startedAtMs,
      timings: request.input.timings,
    }
  }
  const snapshot = await readSource(request.input)
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

/** isUpdateResult distinguishes a completed workspace outcome from captured source input. */
export function isUpdateResult(value: LoadedInputResult): value is UpdateResult {
  return 'status' in value
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
  watch?: typeof watchSourceTree
}

/** CompiledEvent identifies the immutable source version associated with a completed compile. */
export type CompiledEvent = { path: SourcePath; source: string; version?: number; result: UpdateResult }

/** CompileRequest carries one frozen source snapshot and its timing state into Workspace compilation. */
export type CompileRequest = {
  id: number
  source: string
  path: SourcePath
  startedAtMs: number
  queuedAtMs: number
  timings: Timings
  version?: number
}

/** FileManagerInput holds either a frozen source or a disk read deferred until its queue turn. */
export type FileManagerInput = SourceFileManagerInput | DiskFileManagerInput

/** QueuedInput adds the identity needed to report completed requests. */
export type QueuedInput = { id: number; input: FileManagerInput }

/** Pending records the queue generation and completion callback of a source request. */
export type Pending = QueuedInput & {
  entryGeneration: EntryGeneration
  observation: number
  queuedAtMs: number
  resolve(result: UpdateResult): void
}

/** LoadedSource carries a document snapshot and its source acquisition timings. */
export type LoadedSource = {
  path: SourcePath
  source: string
  version: SourceVersion
  startedAtMs: number
  timings: Timings
}

/** CompletedInput carries request details through compile and publication callbacks. */
export type CompletedInput = {
  path: SourcePath
  source: string
  version: SourceVersion
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
export function isRelevantChange(
  change: FileWatch.FileChange,
  watchesFile: (path: string) => boolean,
): boolean {
  const isDirectoryChange = change.kind === 'addDir' || change.kind === 'unlinkDir'
  return isDirectoryChange || Regxs.GeneratedFileExtensionRegx.test(change.path) || watchesFile(change.path)
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
  const report = (error: unknown): void => {
    Try.IgnoreError(() => options.onSourceError?.(error))
  }
  Try(() => options.onSourceUpdate?.(completed.result), { catch: report })
  for (const listener of listeners) {
    Try(() => listener(completed), { catch: report })
  }
}

type SourcePath = string | undefined
type SourceVersion = number | undefined
type EntryGeneration = number | undefined
type WorkspaceRoot = string | undefined
type SourceFileManagerInput = {
  kind: 'source'
  source: string
  path: SourcePath
  version?: number
  startedAtMs: number
  timings: Timings
}
type DiskObservation = 'watch' | 'reconciliation'
type DiskFileManagerInput = { kind: 'disk'; path: string; startedAtMs: number; observation?: DiskObservation }

/** createWatchedInput retains the origin of a file watcher notification through the queued read. */
export function createWatchedInput(path: string, change: FileWatch.FileChange): DiskFileManagerInput {
  const observation = change.reconciled ? 'reconciliation' : 'watch'
  return { kind: 'disk', path, startedAtMs: change.observedAtMs, observation }
}

type ReadResult = { source: string; observedAtMs: number }
type SourceSnapshot = { source: string; observedAtMs: number; timings: Timings }

const readSource = Timings.createTopLevelTimer(async function(
  timings,
  input: DiskFileManagerInput,
): Promise<SourceSnapshot> {
  const observedAtMs = input.startedAtMs
  const observationDelayMs = Math.max(0, Time.timestampMs() - observedAtMs)
  const name = input.observation === 'reconciliation' ? 'workspace.reconciled-to-read' : 'workspace.observe-to-read'
  timings.record(name, Time.nowMs() - observationDelayMs)
  const snapshot = await timings.run(readWorkspaceSource, input.path, observedAtMs)
  return { ...snapshot, timings }
})

const readWorkspaceSource = Timings.measured(
  'workspace.read',
  function(path: string, observedAtMs: number): Promise<ReadResult> {
    return FS.readFile(path, 'utf8').then(source => ({
      source,
      observedAtMs,
    }))
  },
)

function resolveAttemptedFileProject(path: string): string[] {
  // Missing nested files still belong to an existing project root; never observe arbitrary ancestors.
  const project = findNearestProjectRoot(Path.dirname(path))
  return project ? [project] : []
}

function collectUniquePaths(paths: readonly string[]): string[] {
  return Lists.unique(paths.map(path => Path.resolve(path))).sort(Sort.CompareStrings)
}

function haveSamePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index])
}

function haveSameWatchDirectories(
  authored: readonly string[],
  files: readonly string[],
  snapshots: readonly string[],
  nextAuthored: readonly string[],
  nextFiles: readonly string[],
  nextSnapshots: readonly string[],
): boolean {
  return haveSamePaths(authored, nextAuthored)
    && haveSamePaths(files, nextFiles)
    && haveSamePaths(snapshots, nextSnapshots)
}

function createSkippedStages(): Extract<UpdateResult, { status: 'failed' }>['stages'] {
  return {
    typecheck: { stage: 'typecheck', status: 'skipped' },
    fix: { stage: 'fix', status: 'skipped' },
    check: { stage: 'check', status: 'skipped' },
  }
}
