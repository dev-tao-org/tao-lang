import * as AST from '@ast-gen'
import * as Runtime from '@runtime'
import { Json } from '@shared'
import type * as Typecheck from '@typecheck'

import { Errors, Lists } from '@shared'
import { Path } from '@shared/os'

import { buildManagedModulesInput, executeManagedTool } from './ProjectPreparation'
import { requireSetup } from './SetupRequired'
import * as SidecarPipeline from './SidecarPipeline'
import * as ManagedModules from './sidecars/ManagedModule/ManagedModules'

/** ProjectPipelineResult exposes validated foreign-view routing and dynamic source watches. */
export type ProjectPipelineResult = {
  resolveForeignViewPath?: SidecarPipeline.PreparedSidecars['resolveForeignViewPath']
  watchDirectories: readonly string[]
  watchFiles: readonly string[]
  snapshotDirectories: readonly string[]
}

/** WorkspacePreparation contains optional results returned by a project pipeline callback. */
export type WorkspacePreparation = Partial<ProjectPipelineResult>

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
  beforeCompile(
    program: Typecheck.LinkedProgram,
    watchAttemptedFiles?: (files: readonly string[]) => Promise<void>,
  ): Promise<ProjectPipelineResult>
}

/** createProjectPipeline binds prepared dependencies and immutable sidecar snapshots to a session.
 *  Readiness and generated metadata are validated at startup. Reuse matches reachable paths, exact dependency
 *  declarations and foreign-view presence; any changed identity recomputes managed input. Sidecar source
 *  snapshots remain authoritative on every compile, and changed setup inputs require a new session. */
export function createProjectPipeline(
  root: string,
  sessionDirectory: string,
  runtimeOptions: ProjectRuntimeOptions,
): ProjectPipeline {
  return new PipelineSession(root, sessionDirectory, runtimeOptions)
}

class PipelineSession implements ProjectPipeline {
  private graphKey?: string
  private preparedFingerprint?: string
  private managedProfile?: ManagedModules.PreparedManagedModules
  private readonly baseWatchFolders: readonly string[]
  private declarationKey?: string
  private input?: ManagedModules.ManagedModulesInput

  constructor(
    private readonly root: string,
    private readonly sessionDirectory: string,
    private readonly runtimeOptions: ProjectRuntimeOptions,
  ) {
    this.baseWatchFolders = runtimeOptions.watchFolders ?? []
  }

  async beforeCompile(
    program: Typecheck.LinkedProgram,
    watchAttemptedFiles?: (files: readonly string[]) => Promise<void>,
  ): Promise<ProjectPipelineResult> {
    const declarationKey = createDeclarationKey(program)
    const input = declarationKey === this.declarationKey
      ? this.input
      : await buildManagedModulesInput(this.root, program.modules)
    const key = input ? createManagedGraphKey(input) : createEmptyManagedGraphKey()
    this.rejectChangedGraph(key)
    if (!input) {
      await this.prepareRuntimeIfNeeded()
      this.graphKey = key
      this.declarationKey = declarationKey
      this.input = input
      return { watchDirectories: [], watchFiles: [], snapshotDirectories: [] }
    }
    const managed = await this.readManagedProfile(input, key)
    if (this.graphKey === undefined) {
      await validateGeneratedFiles(input)
    }
    const sidecars = await this.prepareSidecars(program, managed, watchAttemptedFiles)
    this.updateRuntimeOptions(input, managed)
    this.graphKey = key
    this.declarationKey = declarationKey
    this.input = input
    return createPipelineResult(sidecars)
  }

  private async prepareRuntimeIfNeeded(): Promise<void> {
    if (this.runtimeOptions.dependencyDirectory) {
      return
    }
    const dependencyDirectory = await Runtime.preparedRuntime({
      toolchainCacheDirectory: this.runtimeOptions.toolchainCacheDirectory,
      resourcesDirectory: this.runtimeOptions.resourcesDirectory,
    })
    if (dependencyDirectory === undefined) {
      requireSetup('Runtime is not prepared. Prepare dependencies with tao setup <entry>, then retry.')
    }
    this.runtimeOptions.dependencyDirectory = dependencyDirectory
  }

  private rejectChangedGraph(key: string): void {
    if (this.graphKey === undefined || this.graphKey === key) {
      return
    }
    const nativeRebuildRequirement = describeNativeRebuildRequirement(this.managedProfile)
    requireSetup(`Dependency graph changed. Setup and preview restart are required.${nativeRebuildRequirement}`)
  }

  private async readManagedProfile(input: ManagedModules.ManagedModulesInput, key: string) {
    if (this.preparedFingerprint !== key || !this.managedProfile) {
      this.managedProfile = await ManagedModules.readManagedModules(input)
      this.preparedFingerprint = key
    }
    return this.managedProfile
  }

  private async prepareSidecars(
    program: Typecheck.LinkedProgram,
    managed: ManagedModules.PreparedManagedModules,
    watchAttemptedFiles?: (files: readonly string[]) => Promise<void>,
  ) {
    return await SidecarPipeline.prepareSidecarPipeline({
      program,
      sessionBuildDirectory: this.sessionDirectory,
      nodeModulesDirectory: Path.join(managed.packageDirectory, 'node_modules'),
      dependencyFingerprint: managed.fingerprint,
      target: 'web',
      executor: executeManagedTool,
      projectDirectory: this.root,
      onWatchFiles: watchAttemptedFiles,
    })
  }

  private updateRuntimeOptions(
    input: ManagedModules.ManagedModulesInput,
    managed: ManagedModules.PreparedManagedModules,
  ): void {
    configureRuntimeDependencies(this.runtimeOptions, input, managed, this.baseWatchFolders, this.sessionDirectory)
  }
}

type OptionalManagedProfile = ManagedModules.PreparedManagedModules | undefined

function describeNativeRebuildRequirement(profile: OptionalManagedProfile): string {
  const nativePackageCount = profile?.nativePackages.length ?? 0
  if (nativePackageCount > 0) {
    return ' A native rebuild is also required.'
  }
  return ''
}

// createDeclarationKey includes reachable files, npm declarations and foreign-view presence.
// Source-only edits retain readiness; a changed declaration or reachable module takes the authoritative path.
function createDeclarationKey(program: Typecheck.LinkedProgram): string {
  return Json.Print(program.modules.map(describeModuleDeclarationFingerprint), { prettyPrint: false })
}

function describeModuleDeclarationFingerprint(module: Typecheck.LinkedProgram['modules'][number]) {
  return {
    path: module.path,
    declarations: AST.GetDeclarations(module.document).flatMap(serializeDeclarationFingerprint),
    foreignViews: AST.GetAllViewDeclarations(module.document).map(declaration =>
      AST.GetForeignViewPath(declaration)?.value ?? null
    ),
  }
}

function serializeDeclarationFingerprint(declaration: AST.Declaration): unknown[][] {
  if (AST.IsKind(declaration, 'RequiresDeclaration')) {
    return [[
      'requires',
      declaration.provider,
      declaration.identifier,
      declaration.version,
      declaration.alias?.value,
    ]]
  }
  const authoredPath = AST.IsViewDeclaration(declaration) ? AST.GetForeignViewPath(declaration) : undefined
  return authoredPath ? [['foreign']] : []
}

function createManagedGraphKey(input: ManagedModules.ManagedModulesInput): string {
  return Json.Print({
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

function createEmptyManagedGraphKey(): string {
  return Json.Print({ modules: [], target: 'web', runtimePins: {}, bunVersion: '' })
}

function createPipelineResult(sidecars: SidecarPipeline.PreparedSidecars): ProjectPipelineResult {
  return {
    resolveForeignViewPath: sidecars.resolveForeignViewPath,
    watchDirectories: sidecars.watchDirectories,
    watchFiles: sidecars.watchFiles,
    snapshotDirectories: sidecars.snapshotDirectories,
  }
}

async function validateGeneratedFiles(input: ManagedModules.ManagedModulesInput): Promise<void> {
  const drift = await ManagedModules.inspectGeneratedModuleFiles(input)
  if (drift.length > 0) {
    const first = drift[0]!
    Errors.ThrowUserInput(`Generated dependency files changed: ${first.path}. Repair with: ${first.repair}.`)
  }
}

function configureRuntimeDependencies(
  options: ProjectRuntimeOptions,
  input: ManagedModules.ManagedModulesInput,
  managed: ManagedModules.PreparedManagedModules,
  baseWatchFolders: readonly string[],
  sessionDirectory: string,
): void {
  options.dependencyDirectory = Path.join(managed.packageDirectory, 'node_modules')
  options.watchFolders = collectRuntimeWatchFolders(baseWatchFolders, managed.packageDirectory, sessionDirectory)
  options.singletonPackages = Runtime.resolveRuntimeSingletonPackages(input.singletonPackages, managed.nativePackages)
}

function collectRuntimeWatchFolders(
  baseWatchFolders: readonly string[],
  packageDirectory: string,
  sessionDirectory: string,
): string[] {
  const foreignViewsDirectory = Path.join(sessionDirectory, 'foreign-views')
  return Lists.unique(baseWatchFolders, [packageDirectory, foreignViewsDirectory])
}
