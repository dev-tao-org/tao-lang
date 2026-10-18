import { transform } from '@ast-gen/Transform'
import { check } from '@check/Check'
import { compile } from '@compile/Compile'
import { fix } from '@fix/Fix'
import { createParser } from '@grammar/parser'
import * as Runtime from '@runtime/Runtime'
import { Errors, Time, Timings, type TimingSample } from '@shared'
import { Path } from '@shared/os'
import { typecheck } from '@typecheck/Typecheck'
import type { Document } from './Document'
import { type CompileRequest, FileManager } from './FileManager'
import type { Project } from './Project'
import { publishBuild } from './WorkspaceBuild'

export { Document } from './Document'
export { createProject } from './Project'
export type { Project, ProjectOptions } from './Project'

/** WorkspaceOptions configures output publication for a single compile session. */
export type WorkspaceOptions = {
  directory?: string
  outputDirectory?: string
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

const WorkspacePublish = Timings.measure('workspace.publish', publishWorkspace)

class WorkspaceSession {
  readonly directory: string | undefined
  private readonly output: ReturnType<typeof outputPaths>
  private readonly parser = createParser()
  private lastGood: string | undefined
  private readonly expectedListeners = new Set<(revision: string, startedAtMs: number) => void>()
  private readonly publishedListeners = new Set<(publication: Publication) => void>()
  private application: Runtime.RuntimeApplication | undefined
  private readonly publishCallback = this.publish.bind(this)
  private readonly prepareRuntimeCallback = this.prepareRuntime.bind(this)
  readonly files: FileManager

  constructor(private readonly options: WorkspaceOptions) {
    const directory = options.directory ?? options.project?.directory
    this.directory = directory ? Path.resolve(directory) : undefined
    this.output = outputPaths(options)
    this.files = new FileManager({
      directory: this.directory,
      outputDirectory: options.outputDirectory ?? (options.project && Path.join(options.project.directory, '.tao')),
      compile: (request, isCurrent) => this.compileAndPublish(request, isCurrent),
      onSourceUpdate: options.onSourceUpdate,
      onSourceError: options.onSourceError,
    })
  }

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
    return await this.files.openFile(path)
  }

  update(source: string | Document, startedAtMs = Time.timestampMs()): Promise<UpdateResult> {
    return this.files.update(source, startedAtMs)
  }

  async dispose(): Promise<void> {
    await this.files.dispose()
  }

  private async compileAndPublish(request: CompileRequest, isCurrent: () => boolean): Promise<UpdateResult> {
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
    await WorkspacePublish(timings, this.publishCallback, output, isCurrent, timings)
    if (!isCurrent()) {
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

  private async publish(output: CompiledApp, isCurrent: () => boolean, timings: Timings): Promise<void> {
    if (this.options.publish) {
      await this.options.publish(output, isCurrent)
      return
    }
    if (!this.output) {
      return
    }
    await publishBuild(
      this.output.buildDirectory,
      output.code,
      this.prepareRuntimeCallback,
      isCurrent,
      timings,
    )
  }

  private async prepareRuntime(): Promise<Runtime.RuntimeApplication> {
    const output = this.output ?? Errors.ThrowUnexpected('Runtime compilation requires a workspace output directory.')
    this.application ??= await Runtime.create({
      ...this.options.runtimeOptions,
      directory: output.runtimeDirectory,
    })
    return this.application
  }
}

function publishWorkspace(
  publish: (output: CompiledApp, isCurrent: () => boolean, timings: Timings) => Promise<void>,
  output: CompiledApp,
  isCurrent: () => boolean,
  timings: Timings,
): Promise<void> {
  return publish(output, isCurrent, timings)
}

function skippedStages(): PipelineStages {
  return { typecheck: typecheck(), fix: fix(), check: check() }
}

function outputPaths(options: WorkspaceOptions): { buildDirectory: string; runtimeDirectory: string } | undefined {
  if (options.outputDirectory) {
    const directory = Path.resolve(options.outputDirectory)
    return { buildDirectory: Path.join(directory, 'build'), runtimeDirectory: Path.join(directory, 'runtime') }
  }
  if (options.project) {
    return {
      buildDirectory: options.project.buildDirectory,
      runtimeDirectory: Path.join(options.project.directory, '.tao/cache/runtime'),
    }
  }
  return undefined
}
