import { transform } from '@ast-gen/Transform'
import { check } from '@check/Check'
import { compile } from '@compile/Compile'
import { fix } from '@fix/Fix'
import { createParser } from '@grammar/parser'
import * as Runtime from '@runtime/Runtime'
import { Errors, Time, Timings, type TimingSample, Try } from '@shared'
import { Path } from '@shared/os'
import { typecheck } from '@typecheck/Typecheck'
import type { Project } from './Project'
import { publishBuild } from './WorkspaceBuild'
import { readSource, type SourceSnapshot, WorkspaceFile } from './WorkspaceFile'

export { createProject } from './Project'
export type { Project, ProjectOptions } from './Project'

/** WorkspaceOptions configures output publication for a single compile session. */
export type WorkspaceOptions = {
  project?: Project
  runtimeOptions?: Omit<Runtime.RuntimeCreateOptions, 'directory'>
  compile?: typeof compile
  publish?: (app: CompiledApp, isCurrent: () => boolean) => Promise<void>
  onExpected?: (revision: string, startedAtMs: number) => void
  onSourceUpdate?: (result: UpdateResult) => void
  onSourceError?: (error: unknown) => void
}

/** Publication records the exact revision and measured pipeline when output reaches disk. */
export type Publication = {
  revision: string
  startedAtMs: number
  publishedAtMs: number
  timings: readonly TimingSample[]
}

/** CompiledApp carries the exact source snapshot and compiler timings for a revision. */
export type CompiledApp = {
  revision: string
  source: string
  code: string
  timings: TimingSample[]
  stages: PipelineStages
}

/** UpdateResult retains the original revision verdict and its measured source-to-publication phases. */
export type UpdateResult =
  | {
    status: 'published' | 'invalid' | 'superseded'
    revision: string
    timings: TimingSample[]
    stages: PipelineStages
  }
  | { status: 'failed'; revision: string; error: string; timings: TimingSample[]; stages: PipelineStages }

/** PipelineStages names downstream passes that are explicitly skipped by workspace compilation. */
export type PipelineStages = {
  typecheck: ReturnType<typeof typecheck>
  fix: ReturnType<typeof fix>
  check: ReturnType<typeof check>
}

/** createWorkspace compiles source snapshots through one bounded current-plus-latest queue.
 *  Invalid input and superseded work preserve the last successfully published application. */
export function createWorkspace(options: WorkspaceOptions) {
  return new WorkspaceSession(options)
}

class WorkspaceSession {
  private readonly parser = createParser()
  private revision = 0
  private current: Pending | undefined
  private queued: Pending | undefined
  private lastGood: string | undefined
  private disposed = false
  private sourceGeneration = 0
  private readonly expectedListeners = new Set<(revision: string, startedAtMs: number) => void>()
  private readonly publishedListeners = new Set<(publication: Publication) => void>()
  private sourceFile: WorkspaceFile | undefined
  private application: Runtime.RuntimeApplication | undefined

  constructor(private readonly options: WorkspaceOptions) {}

  get lastGoodRevision(): string | undefined {
    return this.lastGood
  }

  get runtime(): Runtime.RuntimeApplication | undefined {
    return this.application
  }

  onExpected(listener: (revision: string, startedAtMs: number) => void): () => boolean {
    this.expectedListeners.add(listener)
    return () => this.expectedListeners.delete(listener)
  }

  onPublished(listener: (publication: Publication) => void): () => boolean {
    this.publishedListeners.add(listener)
    return () => this.publishedListeners.delete(listener)
  }

  async openFile(path: string): Promise<UpdateResult> {
    if (this.disposed) {
      Errors.ThrowUserInput('Workspace has been disposed.')
    }
    const sourceGeneration = ++this.sourceGeneration
    this.sourceFile?.dispose()
    this.sourceFile = new WorkspaceFile(
      path,
      (snapshot, isCurrent) => this.enqueue(snapshot, sourceGeneration, isCurrent),
      this.options.onSourceUpdate,
      this.options.onSourceError,
    )
    return await this.sourceFile.open()
  }

  async saveSource(source: string | ((current: string) => string)): Promise<UpdateResult> {
    const file = this.sourceFile ?? Errors.ThrowUserInput('Open a source file before saving an edit.')
    return await file.save(source)
  }

  update(source: string, startedAtMs = Time.timestampMs()): Promise<UpdateResult> {
    return this.enqueue({ source, observedAtMs: startedAtMs, timings: new Timings('workspace:input') })
  }

  private enqueue(
    snapshot: SourceSnapshot,
    sourceGeneration?: number,
    isSourceCurrent?: () => boolean,
  ): Promise<UpdateResult> {
    if (this.disposed) {
      Errors.ThrowUserInput('Workspace has been disposed.')
    }
    let complete!: (result: UpdateResult) => void
    const result = new Promise<UpdateResult>(resolve => complete = resolve)
    const request: Pending = {
      id: ++this.revision,
      source: snapshot.source,
      startedAtMs: snapshot.observedAtMs,
      timings: snapshot.timings,
      queuedAtMs: Time.nowMs(),
      sourceGeneration,
      isSourceCurrent,
      resolve(result: UpdateResult) {
        complete(result)
      },
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

  async updateFile(path: string, startedAtMs = Time.timestampMs()): Promise<UpdateResult> {
    return await this.enqueue(await readSource(path, startedAtMs))
  }

  dispose(): void {
    this.disposed = true
    this.sourceGeneration++
    this.sourceFile?.dispose()
    this.sourceFile = undefined
    this.resolveSuperseded(this.queued)
    this.queued = undefined
  }

  private async processQueue(): Promise<void> {
    while (this.current) {
      const request = this.current
      if (!request) {
        return
      }
      const result = await Try(() => this.compileAndPublish(request), {
        catch(error) {
          return failureResult(request, error)
        },
      })
      request.resolve(result)
      this.current = this.queued
      this.queued = undefined
    }
  }

  private async compileAndPublish(request: Pending): Promise<UpdateResult> {
    const revision = `r${request.id}`
    const timings = request.timings
    timings.record('workspace.queue', request.queuedAtMs)
    const { tree } = this.parser.parse(request.source, timings)
    const document = transform(tree, timings)
    const stages = skippedStages()
    if (!document) {
      return { status: 'invalid', revision, timings: timings.samples, stages }
    }
    const code = (this.options.compile ?? compile)(document, { revision }, timings)
    const output = { revision, source: request.source, code, timings: timings.samples, stages }
    this.options.onExpected?.(revision, request.startedAtMs)
    for (const listener of this.expectedListeners) {
      listener(revision, request.startedAtMs)
    }
    const WorkspacePublish = timings.measure('workspace.publish', this.publish.bind(this))
    await WorkspacePublish(output, request)
    if (!this.isCurrent(request)) {
      return { status: 'superseded', revision, timings: timings.samples, stages }
    }
    this.lastGood = revision
    for (const listener of this.publishedListeners) {
      listener({
        revision,
        startedAtMs: request.startedAtMs,
        publishedAtMs: Time.timestampMs(),
        timings: timings.samples,
      })
    }
    return { status: 'published', revision, timings: timings.samples, stages }
  }

  private latestId(): number {
    return this.queued?.id ?? this.current?.id ?? this.revision
  }

  private isCurrent(request: Pending): boolean {
    return !this.disposed && request.id === this.latestId()
      && (request.sourceGeneration === undefined || request.sourceGeneration === this.sourceGeneration)
      && (request.isSourceCurrent?.() ?? true)
  }

  private async publish(output: CompiledApp, request: Pending): Promise<void> {
    const isCurrent = () => this.isCurrent(request)
    if (this.options.publish) {
      await this.options.publish(output, isCurrent)
      return
    }
    if (!this.options.project) {
      return
    }
    await publishBuild(this.options.project, output.code, this.prepareRuntime.bind(this), isCurrent, request.timings)
  }

  private async prepareRuntime(): Promise<Runtime.RuntimeApplication> {
    const project = this.options.project ?? Errors.ThrowUnexpected('Runtime compilation requires a loaded project.')
    this.application ??= await Runtime.create({
      ...this.options.runtimeOptions,
      directory: Path.join(project.directory, '.tao/cache/runtime'),
    })
    return this.application
  }

  private resolveSuperseded(request: Pending | undefined): void {
    if (request) {
      request.resolve({ status: 'superseded', revision: `r${request.id}`, timings: [], stages: skippedStages() })
    }
  }
}

type Pending = {
  id: number
  source: string
  startedAtMs: number
  queuedAtMs: number
  timings: Timings
  sourceGeneration?: number
  isSourceCurrent?: () => boolean
  resolve(result: UpdateResult): void
}

function failureResult(request: Pending, error: unknown): UpdateResult {
  return {
    status: 'failed',
    revision: `r${request.id}`,
    error: String(error),
    timings: request.timings.samples,
    stages: skippedStages(),
  }
}

function skippedStages(): PipelineStages {
  return { typecheck: typecheck(), fix: fix(), check: check() }
}
