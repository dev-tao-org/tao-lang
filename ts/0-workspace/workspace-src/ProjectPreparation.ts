import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { runtimeDependencies } from '@runtime/Runtime'
import * as Runtime from '@runtime/Runtime'
import { Errors, Timings, Try } from '@shared'
import { Env, FileSystem, Path, Platform, SessionLock, Storage } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import { recordManagedGraphReference } from './dependencies/LockFile'
import { projectDependencyOptions } from './dependencies/Options'
import { validateRequirementPlacement } from './dependencies/Requirements'
import { prepareDependencies } from './dependencies/Store'
import type { DependencyStoreOptions } from './dependencies/Types'
import { readModuleRequirements } from './ModuleRequirements'
import { loadModules } from './modules/Loader'
import { namedPackageRoot, nearestProjectRoot } from './modules/Paths'
import { ProjectDependencies } from './ProjectDependencies'
import { discoverProject } from './projects/Projects'
import {
  type BunExecutor,
  type ManagedModulesInput,
  prepareManagedModules,
  repairManagedModuleFiles,
} from './sidecars/ManagedModules'

/** prepareProject resolves the requested source graph before installing only its reachable npm modules. */
export async function prepareProject(
  entry: string,
  options: PreparationOptions = {},
): Promise<void> {
  const project = await discoverProject(entry)
    ?? Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
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

/** projectManagedInput reads the already locked graph for module tests without downloading dependencies. */
export async function projectManagedInput(entry: string): Promise<ManagedModulesInput | undefined> {
  const project = await discoverProject(entry)
    ?? Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <path>.`)
  const dependencies = new ProjectDependencies(project.root, await projectDependencyOptions(project.root))
  await dependencies.refresh()
  return await managedModulesInput(project.root, await loadEntry(entry, project.root, dependencies))
}

async function prepareEntry(entry: string, root: string, options: PreparationOptions): Promise<void> {
  const services = options.dependencyOptions ?? await projectDependencyOptions(root)
  const executor = options.executor ?? executeManagedTool
  await prepareDependencies(root, await services.readRequirements(root), services, options.update)
  const dependencies = new ProjectDependencies(root, services)
  await dependencies.refresh()
  const sources = await loadEntry(entry, root, dependencies)
  const input = await managedModulesInput(root, sources, options.runtimePins)
  if (!input) {
    await Runtime.prepareRuntime({
      toolchainCacheDirectory: Path.join(root, '.tao/cache/runtime-toolchains'),
      install: options.runtimeInstaller,
    })
    return
  }
  const prepared = options.repair
    ? await repairManagedModuleFiles(input, executor)
    : await prepareManagedModules(input, executor)
  const graphKey = Path.relative(root, entry).replaceAll('\\', '/')
  const durableLockPath = Path.join(root, '.tao/store/npm', `${prepared.fingerprint}.lock`)
  const lockHash = Platform.hashText(await FileSystem.readFile(prepared.lockfile, 'utf8'))
  await recordManagedGraphReference(root, graphKey, prepared.fingerprint, durableLockPath, lockHash)
}

/** managedModulesInput derives an app installation from reachable module-owned npm declarations. */
export async function managedModulesInput(
  root: string,
  sources: readonly Pick<SourceModule, 'path' | 'document'>[],
  runtimePins?: Record<string, string>,
): Promise<ManagedModulesInput | undefined> {
  const modules = new Map<string, ManagedModulesInput['modules'][number]>()
  const needed = new Set<string>()
  const owners = new Map<string, string>()
  let foreign = false
  for (const source of sources) {
    const owner = nearestProjectRoot(Path.dirname(source.path)) ?? root
    validateRequirementPlacement(source.document.root.declarations, source.path, owner)
    const directory = namedPackageRoot(source.path, owner) ?? owner
    owners.set(directory, owner)
    const module = modules.get(directory) ?? { directory, requirements: [] }
    for (const declaration of source.document.root.declarations) {
      foreign ||= AST.IsViewDeclaration(declaration) && AST.IsKind(declaration.render, 'ForeignView')
      if (AST.IsViewDeclaration(declaration) && AST.IsKind(declaration.render, 'ForeignView')) {
        needed.add(directory)
      }
    }
    modules.set(directory, module)
  }
  for (const module of modules.values()) {
    module.requirements = await readModuleRequirements(module.directory, owners.get(module.directory)!)
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

async function loadEntry(entry: string, root: string, dependencies: ProjectDependencies): Promise<SourceModule[]> {
  const parser = createParser()
  const document = transform(parser.parse(await FileSystem.readFile(entry, 'utf8')).tree)
    ?? Errors.ThrowUserInput(`Cannot prepare dependencies of invalid source ${entry}.`)
  return await loadModules(
    { path: entry, document },
    {
      directory: root,
      resolveProject: (importer, alias) => dependencies.resolveProject(importer, alias),
    },
    parser,
    new Timings('dependency-preparation'),
  )
}
