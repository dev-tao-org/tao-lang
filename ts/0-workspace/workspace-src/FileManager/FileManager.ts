import { Errors, Time, Try } from '@shared'
import { FileWatch, Path } from '@shared/os'
import { Document } from '../Document'
import { findNearestProjectRoot, resolveCanonicalPath } from '../modules/Paths'
import type { UpdateResult } from '../Workspace'
import * as FileManagerCompilation from './FileManagerCompilation'
import * as FileManagerInputs from './FileManagerInputs'
import { watchSourceTree } from './SourceWatch'

export type { CompiledEvent, CompileRequest, FileManagerOptions } from './FileManagerCompilation'

type EntryGeneration = number | undefined

/** FileManager owns workspace documents, recursive observation, and the bounded compile lane. */
export class FileManager {
  entryPath: FileManagerEntryPath
  private readonly listeners = new Set<(event: FileManagerCompilation.CompiledEvent) => void>()
  private readonly documents = new Map<string, Document>()
  private watcher?: FileWatch.Watcher
  private watcherStart?: Promise<FileWatch.Watcher>
  private watcherRoot?: string
  private workspaceRoot?: string
  private readonly pipelineDirectories: FileManagerCompilation.PipelineWatchDirectories
  private entryGeneration = 0
  private observationGeneration = 0
  private refreshTimer?: () => void
  private refresh?: FileManagerCompilation.Refresh
  private sequence = 0
  private current?: FileManagerCompilation.Pending
  private queued?: FileManagerCompilation.Pending
  private disposed = false
  private processing?: Promise<void>

  constructor(private readonly options: FileManagerCompilation.FileManagerOptions) {
    this.workspaceRoot = options.directory ? resolveCanonicalPath(options.directory) : undefined
    this.pipelineDirectories = new FileManagerCompilation.PipelineWatchDirectories(options)
  }

  /** onCompiled observes completion for file-backed and in-memory source updates. */
  onCompiled(listener: (event: FileManagerCompilation.CompiledEvent) => void): () => boolean {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** getDocument returns the manager-owned document for a previously observed path. */
  getDocument(path: string): Document | undefined {
    return this.documents.get(path) ?? this.documents.get(resolveCanonicalPath(path))
  }

  /** openFile selects a contained entry and waits for the latest initial workspace compile. */
  async openFile(path: string): Promise<UpdateResult> {
    this.ensureActive()
    const entry = this.resolveEntry(path)
    this.selectWorkspaceRoot(entry)
    const generation = ++this.entryGeneration
    const observation = this.observationGeneration
    this.cancelRefreshTimer()
    this.resolveRefresh(FileManagerCompilation.createSupersededResult(this.sequence))
    this.entryPath = entry
    await this.ensureWatcher()
    if (generation !== this.entryGeneration) {
      return FileManagerCompilation.createSupersededResult(this.sequence)
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

  /** updatePipelineDirectories refreshes source and snapshot watch roots after dependency preparation. */
  async updatePipelineDirectories(
    watchDirectories: readonly string[],
    watchFiles: readonly string[],
    snapshotDirectories: readonly string[],
  ): Promise<void> {
    if (!this.pipelineDirectories.update(this.workspaceRoot, watchDirectories, watchFiles, snapshotDirectories)) {
      return
    }
    await this.updateWatcherDirectories()
  }

  /** watchPipelineFiles retains attempted sidecar paths so missing imports can recover on creation. */
  async watchPipelineFiles(files: readonly string[]): Promise<void> {
    if (this.pipelineDirectories.includeFiles(this.workspaceRoot, files)) {
      await this.updateWatcherDirectories()
    }
  }

  /** update queues an immutable in-memory source version without writing it to disk. */
  update(source: FileManagerInputs.SourceUpdateInput, startedAtMs = Time.timestampMs()): Promise<UpdateResult> {
    this.ensureActive()
    const context = { documents: this.documents, entryPath: this.entryPath }
    const input = FileManagerInputs.snapshotFileManagerInput(context, source, startedAtMs)
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
    this.cancelRefreshTimer()
    this.resolveRefresh(FileManagerCompilation.createSupersededResult(this.sequence))
    this.resolveSuperseded(this.current)
    this.resolveSuperseded(this.queued)
    this.queued = undefined
    const watcher = this.watcherStart ? await Try.WithDefault(undefined, () => this.watcherStart!) : this.watcher
    this.watcher = undefined
    await watcher?.dispose()
    await this.processing
  }

  private async waitForLatestRefresh(
    initial: FileManagerCompilation.Refresh,
    generation: number,
  ): Promise<UpdateResult> {
    let refresh = initial
    while (true) {
      const result = await refresh.promise
      if (generation !== this.entryGeneration || refresh === this.refresh) {
        return result
      }
      refresh = this.refresh ?? refresh
    }
  }

  private startRefresh(
    path: string,
    observedAtMs: number,
    generation: number,
    observation: number,
  ): FileManagerCompilation.Refresh {
    const refresh = FileManagerCompilation.createRefresh()
    this.refresh = refresh
    void this.enqueue({ kind: 'disk', path, startedAtMs: observedAtMs }, generation, observation).then(refresh.settle)
    return refresh
  }

  private onChange(change: FileWatch.FileChange): void {
    if (!this.shouldRefresh(change)) {
      return
    }
    this.observationGeneration++
    this.resolveRefresh(FileManagerCompilation.createSupersededResult(this.sequence))
    const refresh = FileManagerCompilation.createRefresh()
    this.refresh = refresh
    this.cancelRefreshTimer()
    const path = this.entryPath!
    const generation = this.entryGeneration
    const observation = this.observationGeneration
    const debounceMs = this.options.debounceMs ?? 5
    this.refreshTimer = Time.schedule(debounceMs, () => {
      this.refreshTimer = undefined
      const input = FileManagerCompilation.createWatchedInput(path, change)
      void this.enqueue(input, generation, observation)
        .then(refresh.settle)
    })
  }

  private cancelRefreshTimer(): void {
    this.refreshTimer?.()
    this.refreshTimer = undefined
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
    const ignoredDirectories = this.pipelineDirectories.ignored()
    const watch = this.options.watch ?? watchSourceTree
    const additionalDirectories = this.pipelineDirectories.additional()
    this.watcherStart = watch(
      root,
      change => this.onChange(change),
      error => this.options.onSourceError?.(error),
      ignoredDirectories,
      additionalDirectories,
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
    input: FileManagerCompilation.FileManagerInput,
    entryGeneration: EntryGeneration,
    observation: number,
  ): Promise<UpdateResult> {
    let complete!: (result: UpdateResult) => void
    const result = new Promise<UpdateResult>(resolve => complete = resolve)
    const request: FileManagerCompilation.Pending = {
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
      this.processing = this.processQueue()
    }
    return result
  }

  private async processQueue(): Promise<void> {
    while (this.current) {
      const request = this.current
      const completed = await Try(() => this.processRequest(request), {
        catch: error => FileManagerCompilation.createFailedInput(request, error),
      })
      request.resolve(completed.result)
      if (!this.disposed) {
        FileManagerCompilation.notifyCompletion(this.options, this.listeners, completed)
      }
      this.current = this.queued
      this.queued = undefined
    }
  }

  private async processRequest(
    request: FileManagerCompilation.Pending,
  ): Promise<FileManagerCompilation.CompletedInput> {
    if (!this.isCurrent(request)) {
      return FileManagerCompilation.createSupersededInput(request)
    }
    const loaded = await FileManagerCompilation.loadFileManagerInput(
      request,
      this.documents,
      () => this.isCurrent(request),
    )
    if (FileManagerCompilation.isUpdateResult(loaded)) {
      if (loaded.status === 'failed' && request.input.kind === 'disk' && this.isCurrent(request)) {
        this.options.onSourceError?.(loaded.error)
      }
      return FileManagerInputs.completeUnloadedInput(request, loaded)
    }
    if (!this.isCurrent(request)) {
      return FileManagerCompilation.createSupersededInput(request)
    }
    const compileRequest = FileManagerInputs.createCompileRequest(request, loaded)
    const result = await Try(() => this.options.compile(compileRequest, () => this.isCurrent(request)), {
      catch: error => FileManagerCompilation.createFailedResult(request.id, error, loaded.timings.samples),
    })
    return { result, path: loaded.path, source: loaded.source, version: loaded.version }
  }

  private selectWorkspaceRoot(entry: string): void {
    this.workspaceRoot ??= findNearestProjectRoot(Path.dirname(entry)) ?? Path.dirname(entry)
    if (!Path.isWithin(this.workspaceRoot, entry)) {
      Errors.ThrowUserInput(`Entry file must be inside the workspace root: ${entry}`)
    }
  }

  private resolveEntry(path: string): string {
    const absolute = Path.isAbsolute(path) ? path : Path.resolve(this.workspaceRoot ?? '.', path)
    return resolveCanonicalPath(absolute)
  }

  private shouldRefresh(change: FileWatch.FileChange): boolean {
    return this.hasActiveEntry()
      && FileManagerCompilation.isRelevantChange(change, path => this.pipelineDirectories.watchesFile(path))
      && !this.isOutputChange(change.path)
  }

  private hasActiveEntry(): boolean {
    return !this.disposed && this.entryPath !== undefined
  }

  private isOutputChange(path: string): boolean {
    return this.pipelineDirectories.ignores(path)
  }

  private async updateWatcherDirectories(): Promise<void> {
    let watcher = this.watcher
    if (!watcher && this.watcherStart) {
      watcher = await this.watcherStart
    }
    if (!this.disposed) {
      await watcher?.updateDirectories?.(this.pipelineDirectories.additional(), this.pipelineDirectories.ignored())
    }
  }

  private isCurrent(request: FileManagerCompilation.Pending): boolean {
    return this.isActiveRequest(request)
      && request.observation === this.observationGeneration
  }

  private isActiveRequest(request: FileManagerCompilation.Pending): boolean {
    return !this.disposed && request.id === this.latestId() && this.matchesEntryGeneration(request)
  }

  private matchesEntryGeneration(request: FileManagerCompilation.Pending): boolean {
    return request.entryGeneration === undefined || request.entryGeneration === this.entryGeneration
  }

  private latestId(): number {
    return this.queued?.id ?? this.current?.id ?? this.sequence
  }

  private resolveRefresh(result: UpdateResult): void {
    this.refresh?.settle(result)
    this.refresh = undefined
  }

  private resolveSuperseded(request?: FileManagerCompilation.Pending): void {
    if (request) {
      request.resolve(FileManagerCompilation.createSupersededResult(request.id))
    }
  }

  private ensureActive(): void {
    if (this.disposed) {
      Errors.ThrowUserInput('Workspace has been disposed.')
    }
  }
}

type FileManagerEntryPath = string | undefined
