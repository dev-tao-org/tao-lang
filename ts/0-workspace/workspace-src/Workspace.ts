import { transform } from '@ast-gen/Transform'
import { check } from '@check/Check'
import { compile } from '@compile/Compile'
import { createParser } from '@grammar/parser'
import * as Runtime from '@runtime/Runtime'
import { Errors, Time, Timings, type TimingSample } from '@shared'
import { Path, WorkspaceWatch } from '@shared/os'
import * as Stdlib from '@stdlib/Stdlib'
import { linkModules } from '@typecheck/LinkModules'
import type { LinkedProgram } from '@typecheck/Modules'
import { typecheck } from '@typecheck/Typecheck'
import type { Document } from './Document'
import { type CompileRequest, FileManager, type FileManagerOptions } from './FileManager'
import { loadModules, type ModuleLoadOptions } from './modules/Loader'
import type { Project } from './Project'
import type { ProjectPipelineResult } from './ProjectPipeline'
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
  onProgress?: (message: string) => void
  publish?: (app: CompiledApp, isCurrent: () => boolean) => Promise<void>
  onExpected?: (revision: string, startedAtMs: number) => void
  onSourceUpdate?: (result: UpdateResult) => void
  onSourceError?: (error: unknown) => void
  watch?: FileManagerOptions['watch']
  schedule?: FileManagerOptions['schedule']
  resolveProject?: ModuleLoadOptions['resolveProject']
  observeProjectSources?: ModuleLoadOptions['observeProjectSources']
  includeModuleRequirements?: boolean
  beforeLoad?: () => Promise<void>
  watchDirectories?: readonly string[]
  beforeCompile?: (program: LinkedProgram) => Promise<
    & Pick<ProjectPipelineResult, 'foreignViewPath'>
    & Partial<Pick<ProjectPipelineResult, 'watchDirectories' | 'snapshotDirectories'>>
  >
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
  | {
    status: 'failed'
    revision: string
    error: string
    setupRequired?: boolean
    timings: TimingSample[]
    stages: PipelineStages
  }

/** PipelineStages names downstream passes that are explicitly skipped by workspace compilation. */
export type PipelineStages = {
  typecheck: ReturnType<typeof typecheck>
  fix: { stage: 'fix'; status: 'skipped' }
  check: ReturnType<typeof check>
}

/** createWorkspace compiles source snapshots through one bounded current-plus-latest queue.
 *  Invalid input and superseded work preserve the last successfully published application. */
export function createWorkspace(options: WorkspaceOptions) {
  return new WorkspaceSession(options)
}

const LinkModules = Timings.measured('modules.link', linkModules)
const PrepareDependencies = Timings.measured('dependencies.prepared', async function(
  prepare: WorkspaceOptions['beforeCompile'],
  program: LinkedProgram,
) {
  return await prepare?.(program)
})

const LoadSources = Timings.measured(
  'dependencies.sources',
  async (load: WorkspaceOptions['beforeLoad']) => await load?.(),
)
const Publish = Timings.measure('workspace.publish', async function(
  timings,
  publish: (timings: Timings, output: CompiledApp, isCurrent: () => boolean) => Promise<void>,
  output: CompiledApp,
  isCurrent: () => boolean,
) {
  await publish(timings, output, isCurrent)
})

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
      watchDirectories: options.watchDirectories,
      compile: (request, isCurrent) => this.compileAndPublish(request, isCurrent),
      onSourceUpdate: options.onSourceUpdate,
      onSourceError: options.onSourceError,
      async watch(root, change, error, ignored, additional) {
        const stdlib = await Stdlib.projectDirectory()
        const watcher = await (options.watch ?? WorkspaceWatch.watchWorkspace)(
          root,
          change,
          error,
          ignored,
          [...new Set([stdlib, ...additional ?? []])],
        )
        return {
          dispose: () => watcher.dispose(),
          async updateDirectories(directories, excluded) {
            await watcher.updateDirectories?.([...new Set([stdlib, ...directories])], excluded)
          },
        }
      },
      schedule: options.schedule,
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
    const stages = skippedStages()
    const code = await this.build(request)
    if (code === undefined) {
      return { status: 'invalid', revision, timings: timings.samples, stages }
    }
    const output = { revision, source: request.source, code, timings: timings.samples, stages }
    this.options.onExpected?.(revision, request.startedAtMs)
    for (const listener of this.expectedListeners) {
      listener(revision, request.startedAtMs)
    }
    await timings.run(Publish, this.publishCallback, output, isCurrent)
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

  private async build(request: CompileRequest): Promise<string | undefined> {
    const progress = this.options.onProgress
    progress?.('Parsing Tao source…')
    const tree = request.timings.run(this.parser.parse, request.source)
    progress?.('Tao source parsing complete; transforming AST…')
    const document = request.timings.run(transform, tree)
    if (!document) {
      return undefined
    }
    progress?.('Resolving source modules and visibility…')
    await request.timings.run(LoadSources, this.options.beforeLoad)
    const sources = await request.timings.run(
      loadModules,
      { path: request.path ?? '<memory>', document },
      {
        directory: this.directory,
        resolveProject: (importer, alias) => this.resolveProject(importer, alias),
        observeProjectSources: this.options.observeProjectSources,
        includeModuleRequirements: this.options.includeModuleRequirements,
      },
      this.parser,
    )
    const program = request.timings.run(LinkModules, Path.resolve(request.path ?? '<memory>'), sources)
    const prepared = await request.timings.run(PrepareDependencies, this.options.beforeCompile, program)
    await this.files.updatePipelineDirectories(prepared?.watchDirectories ?? [], prepared?.snapshotDirectories ?? [])
    progress?.('Source modules resolved; generating app code…')
    const code = request.timings.run(this.options.compile ?? compile, document, {
      revision: `r${request.id}`,
      program,
      ...prepared,
    })
    progress?.('App code generation complete.')
    return code
  }

  private async resolveProject(importer: string, alias: string): Promise<{ root: string } | undefined> {
    return alias === 'tao'
      ? { root: await Stdlib.projectDirectory() }
      : await this.options.resolveProject?.(importer, alias)
  }

  private async publish(timings: Timings, output: CompiledApp, isCurrent: () => boolean): Promise<void> {
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
      this.options.onProgress,
    )
  }

  private async prepareRuntime(): Promise<Runtime.RuntimeApplication> {
    const output = this.output ?? Errors.ThrowUnexpected('Runtime compilation requires a workspace output directory.')
    this.application ??= await Runtime.create({
      ...this.options.runtimeOptions,
      directory: output.runtimeDirectory,
      onProgress: this.options.onProgress,
    })
    return this.application
  }
}

function skippedStages(): PipelineStages {
  return { typecheck: typecheck(), fix: { stage: 'fix', status: 'skipped' }, check: check() }
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
