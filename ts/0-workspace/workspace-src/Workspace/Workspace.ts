import * as AST from '@ast-gen'
import * as Check from '@check'
import * as Compile from '@compile'
import * as Grammar from '@grammar'
import * as Runtime from '@runtime'
import type * as Expo from '@runtime/expo'
import * as Stdlib from '@stdlib'
import * as Typecheck from '@typecheck'

import { Errors, Lists, Sort, Time, Timings, type TimingSample } from '@shared'
import { Path } from '@shared/os'

import { prepareBuildTypeScript } from '../BuildTypeScript'
import type { Document } from '../Document'
import { type CompileRequest, FileManager } from '../FileManager/FileManager'
import { watchSourceTree } from '../FileManager/SourceWatch'
import { loadModules } from '../modules/Loader'
import { resolveCanonicalPath } from '../modules/Paths'
import { publishBuild } from './WorkspaceBuild'
import type { WorkspaceOptions, WorkspacePreparation } from './WorkspaceOptions'

export { Document } from '../Document'
export * from '../Project'
export type { WorkspaceOptions } from './WorkspaceOptions'
export type { WorkspaceSession }

/** Publication records the exact revision and measured pipeline when output reaches its delivery owner. */
export type Publication = {
  revision: string
  startedAtMs: number
  publicationStartedAtMs: number
  publishedAtMs: number
  timings: readonly TimingSample[]
  outcome?: Expo.PublicationOutcome
}

/** CompiledApp carries the exact source snapshot and compiler timings for a revision. */
export type CompiledApp = {
  revision: string
  source: string
  files: Compile.CompiledFiles
  timings: TimingSample[]
  stages: PipelineStages
}

/** UpdateResult retains the original revision verdict and its measured source-to-publication phases. */
export type UpdateResult =
  | {
    status: UpdateResultStatus
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
  typecheck: Typecheck.TypecheckResult
  fix: { stage: 'fix'; status: 'skipped' }
  check: Check.CheckResult
}

type UpdateResultStatus = 'published' | 'invalid' | 'superseded'
type WorkspaceSourceInput = string | Document
type WorkspaceDirectory = string | undefined
type PreparedWorkspace = WorkspacePreparation

/** createWorkspace compiles source snapshots through one bounded current-plus-latest queue.
 *  Invalid input and superseded work preserve the last successfully published application. */
export function createWorkspace(options: WorkspaceOptions): WorkspaceSession {
  return new WorkspaceSession(options)
}

type ProjectResolution = { root: string } | undefined
type WorkspaceOutputPaths = { buildDirectory: string; runtimeDirectory: string }

const LinkModules = Timings.measured('modules.link', Typecheck.linkModules)
const PrepareDependencies = Timings.measured('dependencies.prepared', async function(
  prepare: WorkspaceOptions['beforeCompile'],
  program: Typecheck.LinkedProgram,
  watchAttemptedFiles: (files: readonly string[]) => Promise<void>,
) {
  return await prepare?.(program, watchAttemptedFiles)
})

const Publish = Timings.measure('workspace.publish', async function(
  timings,
  publish: (timings: Timings, output: CompiledApp, isCurrent: () => boolean) => Promise<void>,
  output: CompiledApp,
  isCurrent: () => boolean,
) {
  await publish(timings, output, isCurrent)
})

type OptionalWorkspaceOutput = WorkspaceOutputPaths | undefined

/** WorkspaceSession owns document compilation, publication and watches for one workspace lifetime. */
class WorkspaceSession {
  readonly directory: WorkspaceDirectory
  private readonly output: OptionalWorkspaceOutput
  private readonly parser: Grammar.Parser = Grammar.createParser()
  private lastGood?: string
  private readonly expectedListeners = new Set<(revision: string, startedAtMs: number) => void>()
  private readonly publishedListeners = new Set<(publication: Publication) => void>()
  private publicationOutcome?: Expo.PublicationOutcome
  private snapshotDirectories: readonly string[] = []
  private application?: Runtime.RuntimeApplication
  private readonly publishCallback = this.publish.bind(this)
  private readonly prepareRuntimeCallback = this.prepareRuntime.bind(this)
  readonly files: FileManager

  constructor(private readonly options: WorkspaceOptions) {
    const directory = options.directory ?? options.project?.directory
    this.directory = directory ? resolveCanonicalPath(directory) : undefined
    this.output = createOutputPaths(options)
    this.files = new FileManager({
      directory: this.directory,
      outputDirectory: options.outputDirectory ?? (options.project && Path.join(options.project.directory, '.tao')),
      watchDirectories: options.watchDirectories,
      compile: (request, isCurrent) => this.compileAndPublish(request, isCurrent),
      onSourceUpdate: options.onSourceUpdate,
      onSourceError: options.onSourceError,
      async watch(root, change, error, ignored, additional) {
        const stdlib = await Stdlib.projectDirectory()
        const additionalDirectories = Lists.unique([stdlib], additional ?? [])
        const watcher = await watchSourceTree(root, change, error, ignored, additionalDirectories)
        return {
          dispose: () => watcher.dispose(),
          async updateDirectories(directories, excluded) {
            await watcher.updateDirectories?.(Lists.unique([stdlib], directories), excluded)
          },
        }
      },
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

  update(source: WorkspaceSourceInput, startedAtMs = Time.timestampMs()): Promise<UpdateResult> {
    return this.files.update(source, startedAtMs)
  }

  async dispose(): Promise<void> {
    await this.files.dispose()
  }

  private async compileAndPublish(request: CompileRequest, isCurrent: () => boolean): Promise<UpdateResult> {
    const revision = `r${request.id}`
    const timings = request.timings
    timings.record('workspace.queue', request.queuedAtMs)
    const stages = createSkippedStages()
    const files = await this.build(request)
    if (files === undefined) {
      return { status: 'invalid', revision, timings: timings.samples, stages }
    }
    const output = { revision, source: request.source, files, timings: timings.samples, stages }
    this.options.onExpected?.(revision, request.startedAtMs)
    for (const listener of this.expectedListeners) {
      listener(revision, request.startedAtMs)
    }
    const publicationStartedAtMs = Time.timestampMs()
    await timings.run(Publish, this.publishCallback, output, isCurrent)
    if (!isCurrent() || this.publicationOutcome?.status === 'superseded') {
      return { status: 'superseded', revision, timings: timings.samples, stages }
    }
    this.lastGood = revision
    for (const listener of this.publishedListeners) {
      listener({
        revision,
        startedAtMs: request.startedAtMs,
        publicationStartedAtMs,
        publishedAtMs: Time.timestampMs(),
        timings: timings.samples,
        outcome: this.publicationOutcome,
      })
    }
    return { status: 'published', revision, timings: timings.samples, stages }
  }

  private async build(request: CompileRequest): Promise<Compile.CompiledFiles | undefined> {
    const progress = this.options.onProgress
    progress?.('Parsing Tao source…')
    const tree = request.timings.run(this.parser.parse, request.source)
    progress?.('Tao source parsing complete; transforming AST…')
    const document = request.timings.run(AST.transform, tree)
    if (!document) {
      return undefined
    }
    progress?.('Resolving source modules and visibility…')
    const sources = await request.timings.run(
      loadModules,
      { path: request.path ?? '<memory>', document },
      {
        directory: this.directory,
        resolveProject: (importer, alias) => this.resolveProject(importer, alias),
        observeProjectSources: this.options.observeProjectSources,
        includeModuleRequirements: this.options.includeModuleRequirements,
        beforeLoad: this.options.beforeLoad,
      },
      this.parser,
    )
    const program = request.timings.run(LinkModules, sources[0]!.path, sources)
    const prepared = await request.timings.run(
      PrepareDependencies,
      this.options.beforeCompile,
      program,
      files => this.files.watchPipelineFiles(files),
    )
    this.acceptSnapshots(prepared?.snapshotDirectories ?? [])
    await this.files.updatePipelineDirectories(
      prepared?.watchDirectories ?? [],
      prepared?.watchFiles ?? [],
      prepared?.snapshotDirectories ?? [],
    )
    progress?.('Source modules resolved; generating app code…')
    const compileOptions = createCompilationOptions(`r${request.id}`, program, prepared)
    const compileDocument = this.options.compile ?? Compile.compile
    const files = request.timings.run(compileDocument, document, compileOptions)
    progress?.('App code generation complete.')
    return files
  }

  private async resolveProject(importer: string, alias: string): Promise<ProjectResolution> {
    return alias === 'tao'
      ? { root: await Stdlib.projectDirectory() }
      : await this.options.resolveProject?.(importer, alias)
  }

  private acceptSnapshots(directories: readonly string[]): void {
    const next = [...directories].sort(Sort.CompareStrings)
    const unchanged = next.length === this.snapshotDirectories.length
      && next.every((path, index) => path === this.snapshotDirectories[index])
    if (this.application?.publishGenerated && !unchanged) {
      Errors.ThrowUserInput('Sidecar snapshot changed. Restart the preview session to load its new files.')
    }
    this.snapshotDirectories = next
  }

  private async publish(timings: Timings, output: CompiledApp, isCurrent: () => boolean): Promise<void> {
    this.publicationOutcome = undefined
    if (this.options.publish) {
      await this.options.publish(output, isCurrent)
      return
    }
    if (!this.output) {
      return
    }
    this.publicationOutcome = await publishBuild(
      this.output.buildDirectory,
      output.files,
      output.revision,
      this.prepareRuntimeCallback,
      isCurrent,
      timings,
      this.options.onProgress,
    )
  }

  private async prepareRuntime(): Promise<Runtime.RuntimeApplication> {
    const output = this.output
    if (output === undefined) {
      Errors.ThrowShouldNeverHappen('Runtime compilation requires a workspace output directory.')
    }
    if (!this.application) {
      const runtimeOptions = createWorkspaceRuntimeOptions(this.options, output.runtimeDirectory)
      const application = await Runtime.create(runtimeOptions)
      await prepareBuildTypeScript(output.buildDirectory, application)
      this.application = application
    }
    return this.application
  }
}

function createCompilationOptions(
  revision: string,
  program: Typecheck.LinkedProgram,
  prepared?: PreparedWorkspace,
): Compile.CompileOptions {
  return { revision, program, ...prepared }
}

function createWorkspaceRuntimeOptions(options: WorkspaceOptions, directory: string): Runtime.RuntimeCreateOptions {
  return { ...options.runtimeOptions, directory, onProgress: options.onProgress }
}

function createSkippedStages(): PipelineStages {
  return { typecheck: Typecheck.typecheck(), fix: { stage: 'fix', status: 'skipped' }, check: Check.check() }
}

function createOutputPaths(options: WorkspaceOptions): WorkspaceOutputPaths | undefined {
  if (options.outputDirectory) {
    const directory = Path.resolve(options.outputDirectory)
    return { buildDirectory: Path.join(directory, 'build'), runtimeDirectory: Path.join(directory, 'expo') }
  }
  if (options.project) {
    return {
      buildDirectory: options.project.buildDirectory,
      runtimeDirectory: Path.join(options.project.directory, '.tao/cache/expo'),
    }
  }
  return undefined
}
