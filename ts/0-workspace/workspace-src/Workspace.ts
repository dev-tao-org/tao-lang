import { transform } from '@ast-gen/Transform'
import { check } from '@check/Check'
import { compile } from '@compile/Compile'
import { fix } from '@fix/Fix'
import { createParser } from '@grammar/parser'
import { Errors, Timings, type TimingSample, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { typecheck } from '@typecheck/Typecheck'
import type { Project } from './Project'

export { createProject } from './Project'
export type { Project, ProjectOptions } from './Project'

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
  private readonly expectedListeners = new Set<(revision: string) => void>()

  constructor(private readonly options: WorkspaceOptions) {}

  get lastGoodRevision(): string | undefined {
    return this.lastGood
  }

  onExpected(listener: (revision: string) => void): () => boolean {
    this.expectedListeners.add(listener)
    return () => this.expectedListeners.delete(listener)
  }

  update(source: string): Promise<UpdateResult> {
    if (this.disposed) {
      Errors.ThrowUserInput('Workspace has been disposed.')
    }
    let complete!: (result: UpdateResult) => void
    const result = new Promise<UpdateResult>(resolve => complete = resolve)
    const request: Pending = {
      id: ++this.revision,
      source,
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

  async updateFile(path: string): Promise<UpdateResult> {
    return await this.update(await FileSystem.readFile(path, 'utf8'))
  }

  dispose(): void {
    this.disposed = true
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
    const timings = new Timings(`workspace:${revision}`)
    const { tree } = this.parser.parse(request.source, timings)
    const document = transform(tree, timings)
    const stages = skippedStages()
    if (!document) {
      return { status: 'invalid', revision, timings: timings.samples, stages }
    }
    const code = (this.options.compile ?? compile)(document, { revision }, timings)
    const output = { revision, source: request.source, code, timings: timings.samples, stages }
    this.options.onExpected?.(revision)
    for (const listener of this.expectedListeners) {
      listener(revision)
    }
    await timings.measure(
      'workspace.publish',
      () =>
        (this.options.publish ?? this.publishApp.bind(this))(
          output,
          () => !this.disposed && request.id === this.latestId(),
        ),
    )
    if (this.disposed || request.id !== this.latestId()) {
      return { status: 'superseded', revision, timings: timings.samples, stages }
    }
    this.lastGood = revision
    return { status: 'published', revision, timings: timings.samples, stages }
  }

  private latestId(): number {
    return this.queued?.id ?? this.current?.id ?? this.revision
  }

  private async publishApp(output: CompiledApp, isCurrent: () => boolean): Promise<void> {
    if (!this.options.project) {
      return
    }
    const target = this.options.project.appPath
    const temporary = `${target}.${output.revision}.pending`
    await FileSystem.mkdir(Path.dirname(target), { recursive: true })
    await FileSystem.writeFile(temporary, output.code, 'utf8')
    if (!isCurrent()) {
      await FileSystem.rm(temporary, { force: true })
      return
    }
    FileSystem.renameSync(temporary, target)
  }

  private resolveSuperseded(request: Pending | undefined): void {
    if (request) {
      request.resolve({ status: 'superseded', revision: `r${request.id}`, timings: [], stages: skippedStages() })
    }
  }
}

/** WorkspaceOptions configures output publication for a single compile session. */
export type WorkspaceOptions = {
  project?: Project
  compile?: typeof compile
  publish?: (app: CompiledApp, isCurrent: () => boolean) => Promise<void>
  onExpected?: (revision: string) => void
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

type Pending = { id: number; source: string; resolve(result: UpdateResult): void }

function failureResult(request: Pending, error: unknown): UpdateResult {
  return {
    status: 'failed',
    revision: `r${request.id}`,
    error: String(error),
    timings: [],
    stages: skippedStages(),
  }
}

function skippedStages(): PipelineStages {
  return { typecheck: typecheck(), fix: fix(), check: check() }
}
