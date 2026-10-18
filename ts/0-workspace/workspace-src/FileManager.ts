import { Errors, Time, Timings, Try } from '@shared'
import { Path, WorkspaceWatch } from '@shared/os'
import { Document, type DocumentSnapshot } from './Document'
import {
  type CompiledEvent,
  type CompileRequest,
  type CompletedInput,
  failedInput,
  failedResult,
  type FileManagerInput,
  type FileManagerOptions,
  inputPath,
  isRelevantChange,
  isWithin,
  type LoadedSource,
  newRefresh,
  notifyCompletion,
  type Pending,
  readSource,
  type Refresh,
  supersededInput,
  supersededResult,
} from './FileManagerCompilation'
import { nearestProjectRoot } from './modules/Paths'
import type { UpdateResult } from './Workspace'

export type { CompiledEvent, CompileRequest, FileManagerOptions, SourceSnapshot } from './FileManagerCompilation'

/** FileManager owns workspace documents, recursive observation, and the bounded compile lane. */
export class FileManager {
  entryPath: string | undefined
  private readonly listeners = new Set<(event: CompiledEvent) => void>()
  private readonly documents = new Map<string, Document>()
  private watcher: WorkspaceWatch.WorkspaceWatcher | undefined
  private watcherStart: Promise<WorkspaceWatch.WorkspaceWatcher> | undefined
  private watcherRoot: string | undefined
  private workspaceRoot: string | undefined
  private entryGeneration = 0
  private observationGeneration = 0
  private refreshTimer: (() => void) | undefined
  private refresh: Refresh | undefined
  private sequence = 0
  private current: Pending | undefined
  private queued: Pending | undefined
  private disposed = false

  constructor(private readonly options: FileManagerOptions) {
    this.workspaceRoot = options.directory ? Path.resolve(options.directory) : undefined
  }

  /** onCompiled observes completion for file-backed and in-memory source updates. */
  onCompiled(listener: (event: CompiledEvent) => void): () => boolean {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** getDocument returns the manager-owned document for a previously observed path. */
  getDocument(path: string): Document | undefined {
    return this.documents.get(path)
  }

  /** openFile selects a contained entry and waits for the latest initial workspace compile. */
  async openFile(path: string): Promise<UpdateResult> {
    this.ensureActive()
    const entry = this.resolveEntry(path)
    this.selectWorkspaceRoot(entry)
    const generation = ++this.entryGeneration
    const observation = this.observationGeneration
    this.refreshTimer?.()
    this.refreshTimer = undefined
    this.resolveRefresh(supersededResult(this.sequence))
    this.entryPath = entry
    await this.ensureWatcher()
    if (generation !== this.entryGeneration) {
      return supersededResult(this.sequence)
    }
    const refresh = this.observationGeneration === observation
      ? this.startRefresh(entry, Time.timestampMs(), generation, observation)
      : this.refresh ?? this.startRefresh(entry, Time.timestampMs(), generation, this.observationGeneration)
    return await this.waitForLatestRefresh(refresh, generation)
  }

  /** compileFile queues one external disk read without starting a persistent watcher. */
  async compileFile(path: string, startedAtMs = Time.timestampMs()): Promise<UpdateResult> {
    this.ensureActive()
    return await this.enqueue(
      { kind: 'disk', path: this.resolveEntry(path), startedAtMs },
      undefined,
      this.observationGeneration,
    )
  }

  /** update queues an immutable in-memory source version without writing it to disk. */
  update(source: string | Document, startedAtMs = Time.timestampMs()): Promise<UpdateResult> {
    this.ensureActive()
    const input = this.snapshotInput(source, startedAtMs)
    return this.enqueue(input, undefined, this.observationGeneration)
  }

  /** dispose invalidates queued work, cancels delayed refreshes, and closes the workspace watcher. */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.entryGeneration++
    this.observationGeneration++
    this.refreshTimer?.()
    this.refreshTimer = undefined
    this.resolveRefresh(supersededResult(this.sequence))
    this.resolveSuperseded(this.current)
    this.resolveSuperseded(this.queued)
    this.queued = undefined
    const watcher = this.watcherStart ? await Try.WithDefault(undefined, () => this.watcherStart!) : this.watcher
    this.watcher = undefined
    await watcher?.dispose()
  }

  private async waitForLatestRefresh(initial: Refresh, generation: number): Promise<UpdateResult> {
    let refresh = initial
    while (true) {
      const result = await refresh.promise
      if (generation !== this.entryGeneration || refresh === this.refresh) {
        return result
      }
      refresh = this.refresh ?? refresh
    }
  }

  private startRefresh(path: string, observedAtMs: number, generation: number, observation: number): Refresh {
    const refresh = newRefresh()
    this.refresh = refresh
    void this.enqueue({ kind: 'disk', path, startedAtMs: observedAtMs }, generation, observation).then(refresh.settle)
    return refresh
  }

  private onChange(change: WorkspaceWatch.WorkspaceChange): void {
    if (!this.shouldRefresh(change)) {
      return
    }
    this.observationGeneration++
    this.resolveRefresh(supersededResult(this.sequence))
    const refresh = newRefresh()
    this.refresh = refresh
    this.refreshTimer?.()
    const path = this.entryPath!
    const generation = this.entryGeneration
    const observation = this.observationGeneration
    this.refreshTimer = (this.options.schedule ?? Time.schedule)(this.options.debounceMs ?? 5, () => {
      this.refreshTimer = undefined
      void this.enqueue({ kind: 'disk', path, startedAtMs: change.observedAtMs }, generation, observation)
        .then(refresh.settle)
    })
  }

  private async ensureWatcher(): Promise<void> {
    const root = this.workspaceRoot!
    if (this.watcherRoot && this.watcherRoot !== root) {
      Errors.ThrowUserInput('A workspace watcher cannot change its root.')
    }
    if (this.watcherStart) {
      await this.watcherStart
      return
    }
    this.watcherRoot = root
    const ignoredDirectories = this.options.outputDirectory ? [this.options.outputDirectory] : []
    this.watcherStart = (this.options.watch ?? WorkspaceWatch.watchWorkspace)(
      root,
      change => this.onChange(change),
      error => this.options.onSourceError?.(error),
      ignoredDirectories,
      this.options.watchDirectories,
    ).then(watcher => {
      this.watcher = watcher
      return watcher
    }, error => {
      this.watcherRoot = undefined
      this.watcherStart = undefined
      Errors.Throw(error)
    })
    await this.watcherStart
  }

  private async enqueue(
    input: FileManagerInput,
    entryGeneration: number | undefined,
    observation: number,
  ): Promise<UpdateResult> {
    let complete!: (result: UpdateResult) => void
    const result = new Promise<UpdateResult>(resolve => complete = resolve)
    const request: Pending = {
      id: ++this.sequence,
      input,
      entryGeneration,
      observation,
      queuedAtMs: Time.nowMs(),
      resolve: complete,
    }
    if (this.current) {
      this.resolveSuperseded(this.queued)
      this.queued = request
    } else {
      this.current = request
      void this.processQueue()
    }
    return result
  }

  private async processQueue(): Promise<void> {
    while (this.current) {
      const request = this.current
      const completed = await Try(() => this.processRequest(request), {
        catch: error => failedInput(request, error),
      })
      request.resolve(completed.result)
      if (!this.disposed) {
        notifyCompletion(this.options, this.listeners, completed)
      }
      this.current = this.queued
      this.queued = undefined
    }
  }

  private async processRequest(request: Pending): Promise<CompletedInput> {
    if (!this.isCurrent(request)) {
      return supersededInput(request)
    }
    const loaded = await this.loadInput(request)
    if ('status' in loaded) {
      if (loaded.status === 'failed' && request.input.kind === 'disk' && this.isCurrent(request)) {
        this.options.onSourceError?.(loaded.error)
      }
      return { result: loaded, path: inputPath(request.input), source: '', version: undefined }
    }
    if (!this.isCurrent(request)) {
      return supersededInput(request)
    }
    const compileRequest: CompileRequest = {
      id: request.id,
      source: loaded.source,
      path: loaded.path,
      startedAtMs: loaded.startedAtMs,
      queuedAtMs: request.queuedAtMs,
      timings: loaded.timings,
      version: loaded.version,
    }
    const result = await Try(() => this.options.compile(compileRequest, () => this.isCurrent(request)), {
      catch: error => failedResult(request.id, error, loaded.timings.samples),
    })
    return { result, path: loaded.path, source: loaded.source, version: loaded.version }
  }

  private async loadInput(request: Pending): Promise<LoadedSource | UpdateResult> {
    if (request.input.kind === 'source') {
      return {
        path: request.input.path,
        source: request.input.source,
        version: request.input.version,
        startedAtMs: request.input.startedAtMs,
        timings: request.input.timings,
      }
    }
    const snapshot = await readSource(request.input.path, request.input.startedAtMs, this.options.read)
    if ('status' in snapshot) {
      return snapshot
    }
    if (!this.isCurrent(request)) {
      return supersededResult(request.id)
    }
    const document = this.documents.get(request.input.path) ?? new Document(request.input.path)
    this.documents.set(request.input.path, document)
    const version = document.replaceSource(snapshot.source).version
    return {
      path: request.input.path,
      source: snapshot.source,
      version,
      startedAtMs: snapshot.observedAtMs,
      timings: snapshot.timings,
    }
  }

  private snapshotInput(source: string | Document, startedAtMs: number): FileManagerInput {
    const timings = new Timings('workspace:input')
    const path = source instanceof Document ? source.path : this.entryPath ?? '<memory>'
    const document = source instanceof Document ? source : this.documents.get(path) ?? new Document(path)
    this.documents.set(path, document)
    const snapshot: DocumentSnapshot = source instanceof Document
      ? source.snapshot()
      : document.replaceSource(source)
    return { kind: 'source', ...snapshot, startedAtMs, timings }
  }

  private selectWorkspaceRoot(entry: string): void {
    this.workspaceRoot ??= nearestProjectRoot(Path.dirname(entry)) ?? Path.dirname(entry)
    if (!isWithin(this.workspaceRoot, entry)) {
      Errors.ThrowUserInput(`Entry file must be inside the workspace root: ${entry}`)
    }
  }

  private resolveEntry(path: string): string {
    return Path.isAbsolute(path) ? Path.resolve(path) : Path.resolve(this.workspaceRoot ?? '.', path)
  }

  private shouldRefresh(change: WorkspaceWatch.WorkspaceChange): boolean {
    return !this.disposed && this.entryPath !== undefined && isRelevantChange(change)
      && !this.isOutputChange(change.path)
  }

  private isOutputChange(path: string): boolean {
    return this.options.outputDirectory !== undefined && isWithin(this.options.outputDirectory, path)
  }

  private isCurrent(request: Pending): boolean {
    return !this.disposed && request.id === this.latestId()
      && (request.entryGeneration === undefined || request.entryGeneration === this.entryGeneration)
      && request.observation === this.observationGeneration
  }

  private latestId(): number {
    return this.queued?.id ?? this.current?.id ?? this.sequence
  }

  private resolveRefresh(result: UpdateResult): void {
    this.refresh?.settle(result)
    this.refresh = undefined
  }

  private resolveSuperseded(request: Pending | undefined): void {
    if (request) {
      request.resolve(supersededResult(request.id))
    }
  }

  private ensureActive(): void {
    if (this.disposed) {
      Errors.ThrowUserInput('Workspace has been disposed.')
    }
  }
}
