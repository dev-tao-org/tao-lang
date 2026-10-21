import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { runtimeDependencies } from '@runtime/Runtime'
import * as Runtime from '@runtime/Runtime'
import { Errors, Timings, Try } from '@shared'
import { Env, FileSystem, Path, Platform, SessionLock, Storage } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import {
  pruneUnreferencedManagedLocks,
  readDependencyLock,
  recordManagedGraphReference,
} from './dependencies/LockFile'
import { projectDependencyOptions } from './dependencies/Options'
import { validateRequirementPlacement } from './dependencies/Requirements'
import { prepareDependencies, prepareSourceDependency } from './dependencies/Store'
import type { DependencyStoreOptions } from './dependencies/Types'
import { moduleRequirements } from './ModuleRequirements'
import { loadModules } from './modules/Loader'
import { namedPackageRoot, nearestProjectRoot } from './modules/Paths'
import { ProjectDependencies } from './ProjectDependencies'
import { discoverProject, ensureProjectMetadata } from './projects/Projects'
import { requireSetup } from './SetupRequired'
import {
  type BunExecutor,
  generatedModuleFiles,
  type ManagedModulesInput,
  prepareManagedModules,
  readManagedModules,
  repairManagedModuleFiles,
} from './sidecars/ManagedModules'

/** prepareProject resolves the requested source graph before installing only its reachable npm modules. */
export async function prepareProject(
  entry: string,
  options: PreparationOptions = {},
): Promise<void> {
  const project = await discoverProject(entry)
    ?? Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
  await ensureProjectMetadata(project.root)
  const lock = await SessionLock.acquire(Path.join(project.taoDirectory, 'locks/preparation.lock'))
    ?? Errors.ThrowUserInput('Another dependency preparation is running for this project. Retry after it finishes.')
  return await Try(() => prepareEntry(entry, project.root, options), { finally: lock.release })
}

/** PreparationOptions supplies explicit updates and local dependency-fixture adapters. */
export type PreparationOptions = {
  update?: string[]
  repair?: boolean
  executor?: BunExecutor
  runtimePins?: Record<string, string>
  runtimeInstaller?: Runtime.RuntimeInstaller
  dependencyOptions?: DependencyStoreOptions
}

/** inspectProjectPreparation checks initial workflow readiness without installing or resolving pins. */
export async function inspectProjectPreparation(
  entry: string,
  options: Pick<PreparationOptions, 'runtimePins' | 'dependencyOptions'> & { moduleRoot?: string; runtime?: boolean } =
    {},
): Promise<void> {
  const project = await discoverProject(entry)
    ?? Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
  const input = await projectManagedInput(entry, options)
  if (
    options.moduleRoot
    && !input?.modules.some(module => Path.resolve(module.directory) === Path.resolve(options.moduleRoot!))
  ) {
    Errors.ThrowUserInput(`Module ${options.moduleRoot} has no reachable managed npm or sidecar profile.`)
  }
  if (!input) {
    if (options.runtime === false) {
      return
    }
    if (
      !await Runtime.preparedRuntime({
        toolchainCacheDirectory: Path.join(project.root, '.tao/cache/runtime-toolchains'),
      })
    ) {
      requireSetup('The app runtime needs setup.')
    }
    return
  }
  await readManagedModules(input)
  const drift = await generatedModuleFiles(input)
  if (drift.length > 0) {
    Errors.ThrowUserInput(`Generated dependency files changed: ${drift[0]!.path}. Repair with tao setup --repair.`)
  }
}

/** managedModulesInput derives an app installation from reachable module-owned npm declarations. */
export async function managedModulesInput(
  root: string,
  sources: readonly Pick<SourceModule, 'path' | 'document'>[],
  runtimePins?: Record<string, string>,
): Promise<ManagedModulesInput | undefined> {
  const modules = new Map<string, ManagedModulesInput['modules'][number]>()
  const needed = new Set<string>()
  let foreign = false
  for (const source of sources) {
    const owner = nearestProjectRoot(Path.dirname(source.path)) ?? root
    validateRequirementPlacement(source.document.root.declarations, source.path, owner)
    const directory = namedPackageRoot(source.path, owner) ?? owner
    const module = modules.get(directory) ?? { directory, requirements: [] }
    module.requirements.push(...moduleRequirements(source.document.root.declarations, source.path))
    for (const declaration of source.document.root.declarations) {
      foreign ||= AST.IsViewDeclaration(declaration) && AST.IsKind(declaration.render, 'ForeignView')
      if (AST.IsViewDeclaration(declaration) && AST.IsKind(declaration.render, 'ForeignView')) {
        needed.add(directory)
      }
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
    runtimePins: runtimePins ?? await runtimeDependencies(),
    bunVersion: Platform.runtimeVersion(),
  }
}

/** executeManagedTool runs pinned workspace tools with Tao's sandbox-compatible Bun cache. */
export const executeManagedTool: BunExecutor = async (command, args, cwd) => {
  const child = Platform.spawn([command, ...args], {
    cwd,
    env: { ...Env.snapshot(), BUN_INSTALL_CACHE_DIR: Storage.cacheDirectory('bun') },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}

// projectManagedInput reads the reachable locked graph without downloading dependencies.
async function projectManagedInput(
  entry: string,
  options: Pick<PreparationOptions, 'runtimePins' | 'dependencyOptions'> = {},
): Promise<ManagedModulesInput | undefined> {
  const project = await discoverProject(entry)
    ?? Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
  const dependencies = new ProjectDependencies(
    project.root,
    options.dependencyOptions ?? await projectDependencyOptions(project.root),
  )
  await dependencies.refresh()
  return await managedModulesInput(
    project.root,
    await loadEntry(entry, project.root, dependencies),
    options.runtimePins,
  )
}

async function prepareEntry(entry: string, root: string, options: PreparationOptions): Promise<void> {
  const services = options.dependencyOptions ?? await projectDependencyOptions(root)
  const executor = options.executor ?? executeManagedTool
  if (options.update?.length) {
    await prepareDependencies(root, await services.readRequirements(root), services, options.update)
  }
  const sources = await prepareEntrySources(entry, root, services)
  const input = await managedModulesInput(root, sources, options.runtimePins)
  if (!input) {
    await Runtime.prepareRuntime({
      toolchainCacheDirectory: Path.join(root, '.tao/cache/runtime-toolchains'),
      install: options.runtimeInstaller,
    })
    return
  }
  const graphKey = Path.relative(root, entry).replaceAll('\\', '/')
  input.previousGraphReference = (await readDependencyLock(Path.join(root, '.tao/store/dependencies.lock.json')))
    ?.npmGraphs?.[graphKey]
  const prepared = options.repair
    ? await repairManagedModuleFiles(input, executor)
    : await prepareManagedModules(input, executor)
  const durableLockPath = Path.join(root, '.tao/store/npm', `${prepared.graphFingerprint}.lock`)
  const lockHash = Platform.hashText(await FileSystem.readFile(prepared.lockfile, 'utf8'))
  await recordManagedGraphReference(root, graphKey, prepared.graphFingerprint, durableLockPath, lockHash)
  await pruneUnreferencedManagedLocks(root)
}

async function prepareEntrySources(
  entry: string,
  root: string,
  services: DependencyStoreOptions,
): Promise<SourceModule[]> {
  const lock = await SessionLock.acquire(Path.join(root, '.tao/locks/dependencies.lock'))
    ?? Errors.ThrowUserInput('Another source dependency setup is running; retry after it finishes.')
  const resolutions = new Map<string, Promise<{ root: string }>>()
  return await Try(() =>
    loadEntry(entry, root, {
      resolveProject(importer, alias) {
        const owner = nearestProjectRoot(Path.dirname(importer)) ?? root
        const key = `${owner}:${alias}`
        const resolved = resolutions.get(key) ?? prepareSourceDependency(root, owner, alias, services)
        resolutions.set(key, resolved)
        return resolved
      },
    }), { finally: lock.release })
}

async function loadEntry(
  entry: string,
  root: string,
  dependencies: Pick<ProjectDependencies, 'resolveProject'>,
): Promise<SourceModule[]> {
  const parser = createParser()
  const document = transform(parser.parse(await FileSystem.readFile(entry, 'utf8')).tree)
    ?? Errors.ThrowUserInput(`Cannot prepare dependencies of invalid source ${entry}.`)
  return await loadModules(
    { path: entry, document },
    {
      directory: root,
      includeModuleRequirements: true,
      resolveProject: (importer, alias) => dependencies.resolveProject(importer, alias),
    },
    parser,
    new Timings('dependency-preparation'),
  )
}
