import * as Runtime from '@runtime/Runtime'
import { Errors } from '@shared'
import { Path } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import { executeManagedTool, managedModulesInput } from './ProjectPreparation'
import { type PreparedSidecars, prepareSidecarPipeline } from './SidecarPipeline'
import { generatedModuleFiles, type ManagedModulesInput, readManagedModules } from './sidecars/ManagedModules'

/** ProjectPipelineResult exposes validated foreign-view routing and dynamic source watches. */
export type ProjectPipelineResult = {
  foreignViewPath?: PreparedSidecars['foreignViewPath']
  watchDirectories: readonly string[]
  snapshotDirectories: readonly string[]
}

/** ProjectRuntimeOptions carries runtime-owned mutable Metro configuration. */
export type ProjectRuntimeOptions = {
  dependencyDirectory?: string
  toolchainCacheDirectory?: string
  resourcesDirectory?: string
  watchFolders?: readonly string[]
  singletonPackages?: readonly string[]
}

/** ProjectPipeline validates one prepared dependency graph for the life of a preview session. */
export type ProjectPipeline = {
  beforeCompile(program: LinkedProgram): Promise<ProjectPipelineResult>
}

/** ProjectPipelineServices isolates prepared graph reads for focused lifecycle tests. */
export type ProjectPipelineServices = {
  managedInput(root: string, program: LinkedProgram): Promise<ManagedModulesInput | undefined>
  readManaged(input: ManagedModulesInput): ReturnType<typeof readManagedModules>
  generatedFiles(input: ManagedModulesInput): ReturnType<typeof generatedModuleFiles>
  prepareSidecars(options: Parameters<typeof prepareSidecarPipeline>[0]): ReturnType<typeof prepareSidecarPipeline>
}

/** createProjectPipeline binds prepared project dependencies and immutable sidecar snapshots to a session. */
export function createProjectPipeline(
  root: string,
  sessionDirectory: string,
  runtimeOptions: ProjectRuntimeOptions,
  services: ProjectPipelineServices = {
    managedInput: async (projectRoot, program) => managedModulesInput(projectRoot, program.modules),
    readManaged: readManagedModules,
    generatedFiles: generatedModuleFiles,
    prepareSidecars: prepareSidecarPipeline,
  },
): ProjectPipeline {
  return new PipelineSession(root, sessionDirectory, runtimeOptions, services)
}

class PipelineSession implements ProjectPipeline {
  private graphKey: string | undefined
  private preparedFingerprint: string | undefined
  private managedProfile: Awaited<ReturnType<typeof readManagedModules>> | undefined
  private readonly baseWatchFolders: readonly string[]

  constructor(
    private readonly root: string,
    private readonly sessionDirectory: string,
    private readonly runtimeOptions: ProjectRuntimeOptions,
    private readonly services: ProjectPipelineServices,
  ) {
    this.baseWatchFolders = runtimeOptions.watchFolders ?? []
  }

  async beforeCompile(program: LinkedProgram): Promise<ProjectPipelineResult> {
    const input = await this.services.managedInput(this.root, program)
    const key = input ? managedGraphKey(input) : emptyManagedGraphKey()
    this.rejectChangedGraph(key)
    if (!input) {
      if (!this.runtimeOptions.dependencyDirectory) {
        this.runtimeOptions.dependencyDirectory = await Runtime.preparedRuntime({
          toolchainCacheDirectory: this.runtimeOptions.toolchainCacheDirectory,
          resourcesDirectory: this.runtimeOptions.resourcesDirectory,
        })
          ?? Errors.ThrowUserInput(
            'Runtime is not prepared. Prepare dependencies with tao prepare <entry>, then retry.',
          )
      }
      this.graphKey = key
      return { watchDirectories: [], snapshotDirectories: [] }
    }
    const managed = await this.readManagedProfile(input, key)
    await validateGeneratedFiles(this.services, input)
    const sidecars = await this.prepareSidecars(program, managed)
    this.updateRuntimeOptions(input, managed)
    this.graphKey = key
    return result(sidecars)
  }

  private rejectChangedGraph(key: string): void {
    if (this.graphKey === undefined || this.graphKey === key) {
      return
    }
    const native = (this.managedProfile?.nativePackages.length ?? 0) > 0
      ? ' A native rebuild is also required.'
      : ''
    Errors.ThrowUserInput(`Dependency graph changed. Run tao prepare, then restart preview.${native}`)
  }

  private async readManagedProfile(input: ManagedModulesInput, key: string) {
    if (this.preparedFingerprint !== key || !this.managedProfile) {
      this.managedProfile = await this.services.readManaged(input)
      this.preparedFingerprint = key
    }
    return this.managedProfile
  }

  private async prepareSidecars(program: LinkedProgram, managed: Awaited<ReturnType<typeof readManagedModules>>) {
    return await this.services.prepareSidecars({
      program,
      sessionBuildDirectory: this.sessionDirectory,
      nodeModulesDirectory: Path.join(managed.packageDirectory, 'node_modules'),
      dependencyFingerprint: managed.fingerprint,
      target: 'web',
      executor: executeManagedTool,
      projectDirectory: this.root,
    })
  }

  private updateRuntimeOptions(
    input: ManagedModulesInput,
    managed: Awaited<ReturnType<typeof readManagedModules>>,
  ): void {
    runtimeDependencyOptions(this.runtimeOptions, input, managed, this.baseWatchFolders, this.sessionDirectory)
  }
}

function managedGraphKey(input: ManagedModulesInput): string {
  return JSON.stringify({
    modules: input.modules.map(module => ({
      directory: module.directory,
      requirements: module.requirements.map(({ name, version }) => ({ name, version }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    })).filter(module => module.requirements.length > 0),
    target: input.target,
    runtimePins: input.runtimePins,
    bunVersion: input.bunVersion,
    singletonPackages: input.singletonPackages,
  })
}

function emptyManagedGraphKey(): string {
  return JSON.stringify({ modules: [], target: 'web', runtimePins: {}, bunVersion: '' })
}

function result(sidecars: PreparedSidecars): ProjectPipelineResult {
  return {
    foreignViewPath: sidecars.foreignViewPath,
    watchDirectories: sidecars.watchDirectories,
    snapshotDirectories: sidecars.snapshotDirectories,
  }
}

async function validateGeneratedFiles(services: ProjectPipelineServices, input: ManagedModulesInput): Promise<void> {
  const drift = await services.generatedFiles(input)
  if (drift.length > 0) {
    const first = drift[0]!
    Errors.ThrowUserInput(`Generated dependency files changed: ${first.path}. Repair with: ${first.repair}.`)
  }
}

function runtimeDependencyOptions(
  options: ProjectRuntimeOptions,
  input: ManagedModulesInput,
  managed: Awaited<ReturnType<typeof readManagedModules>>,
  baseWatchFolders: readonly string[],
  sessionDirectory: string,
): void {
  options.dependencyDirectory = Path.join(managed.packageDirectory, 'node_modules')
  options.watchFolders = [
    ...new Set([
      ...baseWatchFolders,
      managed.packageDirectory,
      Path.join(sessionDirectory, 'foreign-views'),
    ]),
  ]
  options.singletonPackages = [
    ...new Set([
      ...Object.keys(input.runtimePins),
      ...managed.nativePackages,
    ]),
  ]
}
