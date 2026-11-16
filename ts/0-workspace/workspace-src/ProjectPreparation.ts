import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Runtime from '@runtime'
import Exec from '@shared/os/exec'
import * as SourceValidation from '@source-validation'
import type * as Typecheck from '@typecheck'

import { Errors, Try } from '@shared'
import { FileLock, FS, Path, Platform, Storage } from '@shared/os'

import * as LockFile from './dependencies/LockFile'
import { createProjectDependencyOptions } from './dependencies/Options'
import { validateRequirementPlacement } from './dependencies/Requirements'
import { prepareDependencies, prepareSourceDependency } from './dependencies/Store'
import type { DependencyStoreOptions } from './dependencies/Types'
import { collectModuleRequirements } from './ModuleRequirements'
import { loadModules } from './modules/Loader'
import { findNamedPackageRoot, findNearestProjectRoot } from './modules/Paths'
import { ProjectDependencies } from './ProjectDependencies'
import * as Lifecycle from './projects/Lifecycle'
import { discoverProject, ensureProjectMetadata } from './projects/Projects'
import { requireSetup } from './SetupRequired'
import * as ManagedModules from './sidecars/ManagedModule/ManagedModules'

/** PreparationOptions supplies explicit updates and local dependency-fixture adapters. */
export type PreparationOptions = {
  update?: string[]
  repair?: boolean
  executor?: ManagedModules.BunExecutor
  runtimePins?: Runtime.RuntimePackageVersions
  runtimeInstaller?: Runtime.RuntimeInstaller
  dependencyOptions?: DependencyStoreOptions
}

/** ProjectPreparationInspectionOptions selects scoped setup-readiness checks. */
export type ProjectPreparationInspectionOptions = Pick<PreparationOptions, ProjectPreparationOption> & {
  moduleRoot?: string
  runtime?: boolean
}

/** prepareProject resolves the requested source graph before installing only its reachable npm modules. */
export async function prepareProject(
  entry: string,
  options: PreparationOptions = {},
): Promise<void> {
  const project = await discoverProject(entry)
  if (!project) {
    Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
  }
  await ensureProjectMetadata(project.root)
  const lifecycle = await Lifecycle.acquireProjectLifecycle(project.root)
  if (!lifecycle) {
    Errors.ThrowUserInput('Project maintenance is active. Retry dependency preparation when it finishes.')
  }
  return await Try(async () => {
    const lock = await FileLock.tryAcquire(Path.join(project.taoDirectory, 'locks/preparation.lock'))
    if (!lock) {
      Errors.ThrowUserInput('Another dependency preparation is running for this project. Retry after it finishes.')
    }
    return await Try(() => prepareEntry(entry, project.root, options), { finally: lock.release })
  }, { finally: lifecycle.release })
}

/** inspectProjectPreparation checks initial workflow readiness without installing or resolving pins. */
export async function inspectProjectPreparation(
  entry: string,
  options: ProjectPreparationInspectionOptions = {},
): Promise<void> {
  const project = await discoverProject(entry)
  if (!project) {
    Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
  }
  const input = await loadProjectManagedInput(entry, options)
  requireReachableManagedModule(input, options.moduleRoot)
  if (!input) {
    if (options.runtime === false) {
      return
    }
    await requirePreparedRuntime(project.root)
    return
  }
  await ManagedModules.readManagedModules(input)
  const drift = await ManagedModules.inspectGeneratedModuleFiles(input)
  if (drift.length > 0) {
    Errors.ThrowUserInput(`Generated dependency files changed: ${drift[0]!.path}. Repair with tao setup --repair.`)
  }
}

type SourceModuleField = 'path' | 'document'
/** buildManagedModulesInput derives an app installation from reachable module-owned npm declarations. */
export async function buildManagedModulesInput(
  root: string,
  sources: readonly Pick<Typecheck.SourceModule, SourceModuleField>[],
  runtimePins?: Runtime.RuntimePackageVersions,
): Promise<ManagedModules.ManagedModulesInput | undefined> {
  const modules = new Map<string, ManagedModules.ManagedModulesInput['modules'][number]>()
  const needed = new Set<string>()
  let foreign = false
  for (const source of sources) {
    const owner = findNearestProjectRoot(Path.dirname(source.path)) ?? root
    validateRequirementPlacement(source.document, source.path, owner)
    const directory = findNamedPackageRoot(source.path, owner) ?? owner
    const module = modules.get(directory) ?? { directory, requirements: [] }
    module.requirements.push(...collectModuleRequirements(source.document, source.path))
    const hasForeignViews = AST.HasForeignViews(source.document)
    foreign ||= hasForeignViews
    if (hasForeignViews) {
      needed.add(directory)
    }
    modules.set(directory, module)
  }
  for (const module of modules.values()) {
    if (module.requirements.length > 0) {
      needed.add(module.directory)
    }
  }
  if (!foreign && [...modules.values()].every(module => module.requirements.length === 0)) {
    return undefined
  }
  return {
    directory: root,
    modules: [...modules.values()].filter(module => needed.has(module.directory)),
    target: 'web',
    runtimePins: runtimePins ?? await Runtime.runtimeDependencies(),
    runtimePolicy: runtimePins ? undefined : await Runtime.runtimeDependencyPolicy(),
    bunVersion: Platform.runtimeVersion(),
  }
}

/** executeManagedTool runs pinned workspace tools with Tao's sandbox-compatible Bun cache. */
export const executeManagedTool: ManagedModules.BunExecutor = async (command, args, cwd) => {
  const addEnv = { BUN_INSTALL_CACHE_DIR: Storage.resolveCacheDirectory('bun') }
  const result = await Exec.capture(command, [...args], { check: false, cwd, addEnv })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

type ProjectPreparationOption = 'runtimePins' | 'dependencyOptions'

type OptionalManagedInput = ManagedModules.ManagedModulesInput | undefined
type RequestedModuleRoot = string | undefined

function requireReachableManagedModule(input: OptionalManagedInput, moduleRoot: RequestedModuleRoot): void {
  if (!moduleRoot) {
    return
  }
  const reachable = input?.modules.some(module => Path.resolve(module.directory) === Path.resolve(moduleRoot))
  if (!reachable) {
    Errors.ThrowUserInput(`Module ${moduleRoot} has no reachable managed npm or sidecar profile.`)
  }
}

async function requirePreparedRuntime(projectRoot: string): Promise<void> {
  const toolchainCacheDirectory = Path.join(projectRoot, '.tao/cache/runtime-toolchains')
  const prepared = await Runtime.preparedRuntime({ toolchainCacheDirectory })
  if (!prepared) {
    requireSetup('The app runtime needs setup.')
  }
}

// loadProjectManagedInput reads the reachable locked graph without downloading dependencies.
async function loadProjectManagedInput(
  entry: string,
  options: Pick<PreparationOptions, ProjectPreparationOption> = {},
): Promise<ManagedModules.ManagedModulesInput | undefined> {
  const project = await discoverProject(entry)
  if (!project) {
    Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
  }
  const dependencies = new ProjectDependencies(
    project.root,
    options.dependencyOptions ?? await createProjectDependencyOptions(project.root),
  )
  await dependencies.refresh()
  return await buildManagedModulesInput(
    project.root,
    await loadEntry(await readPreparationEntry(entry), project.root, dependencies),
    options.runtimePins,
  )
}

async function prepareEntry(entry: string, root: string, options: PreparationOptions): Promise<void> {
  const source = await readPreparationEntry(entry)
  const services = options.dependencyOptions ?? await createProjectDependencyOptions(root)
  const executor = options.executor ?? executeManagedTool
  if (options.update?.length) {
    SourceValidation.assertValidStatements(source.document, source.path)
    await prepareDependencies(root, await services.readRequirements(root), services, options.update)
  }
  const sources = await prepareEntrySources(source, root, services)
  const input = await buildManagedModulesInput(root, sources, options.runtimePins)
  if (!input) {
    await Runtime.prepareRuntime({
      toolchainCacheDirectory: Path.join(root, '.tao/cache/runtime-toolchains'),
      install: options.runtimeInstaller,
    })
    return
  }
  const graphKey = Path.relative(root, entry).replaceAll('\\', '/')
  input.previousGraphReference =
    (await LockFile.readDependencyLock(Path.join(root, '.tao/store/dependencies.lock.json')))
      ?.npmGraphs?.[graphKey]
  const prepared = options.repair
    ? await ManagedModules.repairManagedModuleFiles(input, executor)
    : await ManagedModules.prepareManagedModules(input, executor)
  const durableLockPath = Path.join(root, '.tao/store/npm', `${prepared.graphFingerprint}.lock`)
  const lockHash = Platform.hashText(await FS.readFile(prepared.lockfile, 'utf8'))
  await LockFile.recordManagedGraphReference(root, graphKey, prepared.graphFingerprint, durableLockPath, lockHash)
  await LockFile.pruneUnreferencedManagedLocks(root)
}

async function prepareEntrySources(
  entry: PreparationEntry,
  root: string,
  services: DependencyStoreOptions,
): Promise<Typecheck.SourceModule[]> {
  const lock = await FileLock.tryAcquire(Path.join(root, '.tao/locks/dependencies.lock'))
  if (!lock) {
    Errors.ThrowUserInput('Another source dependency setup is running; retry after it finishes.')
  }
  const resolutions = new Map<string, Promise<{ root: string }>>()
  const resolvedPins = new Map<string, string>()
  return await Try(() =>
    loadEntry(entry, root, {
      resolveProject(importer, alias) {
        const owner = findNearestProjectRoot(Path.dirname(importer)) ?? root
        const key = `${owner}:${alias}`
        let resolved = resolutions.get(key)
        if (resolved === undefined) {
          resolved = prepareSourceDependency(root, owner, alias, services, resolvedPins)
        }
        resolutions.set(key, resolved)
        return resolved
      },
    }), { finally: lock.release })
}

type PreparationEntry = { path: string; document: AST.Document; parser: Grammar.Parser }

async function readPreparationEntry(path: string): Promise<PreparationEntry> {
  const parser = Grammar.createParser()
  const document = AST.transform(parser.parse(await FS.readFile(path, 'utf8')))
  if (document === undefined) {
    Errors.ThrowUserInput(`Cannot prepare dependencies of invalid source ${path}.`)
  }
  return { path, document, parser }
}

async function loadEntry(
  entry: PreparationEntry,
  root: string,
  dependencies: Pick<ProjectDependencies, 'resolveProject'>,
): Promise<Typecheck.SourceModule[]> {
  return await loadModules(
    entry,
    {
      directory: root,
      includeModuleRequirements: true,
      resolveProject: (importer, alias) => dependencies.resolveProject(importer, alias),
    },
    entry.parser,
  )
}
