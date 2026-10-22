import * as AST from '@ast-gen/AST'
import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import {
  findNamedPackageRoot,
  findNearestProjectRoot,
  resolveRealPathInsideProject,
  within,
} from './modules/Paths'
import { collectModuleSpecifiers, getFileExtension } from './sidecar-pipeline/Imports'
import {
  buildSnapshot,
  cachedSnapshotMatches,
  sidecarAssetExtensions,
  type SidecarGroup,
  snapshotModuleDirectory,
} from './sidecar-pipeline/Snapshots'
import type { ContractExecutor } from './sidecars/ForeignViewContracts'

/** SidecarPipelineOptions defines one compiler check and immutable sidecar snapshot. */
export type SidecarPipelineOptions = {
  program: LinkedProgram
  sessionBuildDirectory: string
  nodeModulesDirectory: string
  dependencyFingerprint: string
  target: string
  executor: ContractExecutor
  compiler?: string
  projectDirectory?: string
  typescriptDefaultsPath?: string
  snapshotLimit?: number
}

/** PreparedSidecars exposes only validated snapshots to generated app compilation. */
export type PreparedSidecars = {
  fingerprint: string
  resolveForeignViewPath(modulePath: string, authoredPath: string): string
  watchDirectories: readonly string[]
  snapshotDirectories: readonly string[]
}

/** prepareSidecarPipeline snapshots foreign view inputs and validates their named exports. */
export async function prepareSidecarPipeline(options: SidecarPipelineOptions): Promise<PreparedSidecars> {
  const nodeModulesDirectory = FileSystem.realpathSync(options.nodeModulesDirectory)
  const groups = await collectSidecarInputs(options)
  const defaultsPath = options.typescriptDefaultsPath
    ?? Path.join(
      options.projectDirectory ?? Path.dirname(options.program.entry),
      '.tao/cache/sidecars/typescript-defaults.json',
    )
  const defaultsContents = await FileSystem.readFile(defaultsPath, 'utf8')
  const fingerprint = fingerprintFor(options, nodeModulesDirectory, groups, defaultsContents)
  const requestedSnapshotRoot = Path.join(options.sessionBuildDirectory, 'foreign-views', fingerprint)
  const cachedRoot = await findCachedSnapshot(
    requestedSnapshotRoot,
    groups,
    fingerprint,
    nodeModulesDirectory,
  )
  let snapshotRoot = cachedRoot ?? requestedSnapshotRoot
  let snapshotDirectories = groups.map(group => snapshotModuleDirectory(snapshotRoot, group.moduleRoot))
  if (!cachedRoot) {
    snapshotRoot = await buildSnapshot(
      options,
      groups,
      requestedSnapshotRoot,
      fingerprint,
      nodeModulesDirectory,
      defaultsPath,
      options.snapshotLimit,
    )
    snapshotDirectories = groups.map(group => snapshotModuleDirectory(snapshotRoot, group.moduleRoot))
  }
  const pathMap = snapshotForeignViewPaths(groups, snapshotDirectories)
  return {
    fingerprint,
    resolveForeignViewPath(modulePath, authoredPath) {
      const absoluteModulePath = Path.resolve(modulePath)
      const resolvedAuthoredPath = resolveAuthoredForeignPath(absoluteModulePath, authoredPath)
      const key = createForeignViewKey(absoluteModulePath, resolvedAuthoredPath)
      return pathMap.get(key) ?? Errors.ThrowUserInput(`Foreign view path was not validated: ${authoredPath}`)
    },
    watchDirectories: [...new Set(groups.flatMap(group => [...group.files.keys()].map(Path.dirname)))].sort(),
    snapshotDirectories: [snapshotRoot, ...snapshotDirectories],
  }
}

function snapshotForeignViewPaths(
  groups: readonly SidecarGroup[],
  directories: readonly string[],
): Map<string, string> {
  const pathMap = new Map<string, string>()
  groups.forEach((group, index) => {
    const directory = directories[index]!
    for (const view of group.views) {
      const authoredPath = AST.GetForeignViewPath(view.declaration)
        ?? Errors.Throw(`Expected a foreign view render for ${AST.GetViewName(view.declaration)}.`)
      pathMap.set(
        createForeignViewKey(view.module.path, resolveAuthoredForeignPath(view.module.path, authoredPath.value)),
        Path.join(directory, view.relativeSidecarPath),
      )
    }
  })
  return pathMap
}

async function findCachedSnapshot(
  requestedRoot: string,
  groups: readonly SidecarGroup[],
  fingerprint: string,
  nodeModulesDirectory: string,
): Promise<string | undefined> {
  const requestedDirectories = groups.map(group => snapshotModuleDirectory(requestedRoot, group.moduleRoot))
  if (await cachedSnapshotMatches(requestedRoot, fingerprint, nodeModulesDirectory, requestedDirectories)) {
    return requestedRoot
  }
  const parent = Path.dirname(requestedRoot)
  const recoveryPrefix = `${Path.basename(requestedRoot)}.recovered`
  const siblings = await Try.WithDefault<Promise<string[]>, string[]>([], () => FileSystem.readdir(parent))
  const candidates = siblings.filter(name => name.startsWith(recoveryPrefix)).sort()
    .map(name => Path.join(parent, name))
  for (const candidate of candidates) {
    const directories = groups.map(group => snapshotModuleDirectory(candidate, group.moduleRoot))
    if (await cachedSnapshotMatches(candidate, fingerprint, nodeModulesDirectory, directories)) {
      return candidate
    }
  }
  return undefined
}

async function collectSidecarInputs(options: SidecarPipelineOptions): Promise<SidecarGroup[]> {
  const entryPath = options.program.entry
  const projectDirectory = options.projectDirectory
    ? Path.resolve(options.projectDirectory)
    : findNearestProjectRoot(Path.dirname(entryPath)) ?? Path.dirname(entryPath)
  const canonicalConsumerDirectory = FileSystem.realpathSync(projectDirectory)
  const groups = new Map<string, SidecarGroup>()
  for (const module of options.program.modules) {
    for (const declaration of AST.GetViewDeclarations(module.document)) {
      const authoredPath = AST.GetForeignViewPath(declaration)
      if (authoredPath === undefined) {
        continue
      }
      const modulePath = FileSystem.realpathSync(Path.resolve(module.path))
      const projectRoot = FileSystem.realpathSync(
        findNearestProjectRoot(Path.dirname(modulePath)) ?? canonicalConsumerDirectory,
      )
      const realModulePath = resolveRealPathInsideProject(modulePath, projectRoot)
        ?? Errors.ThrowUserInput(`Tao module is outside its project boundary: ${modulePath}`)
      const moduleRoot = findNamedPackageRoot(realModulePath, projectRoot) ?? projectRoot
      const resolvedAuthoredPath = resolveAuthoredForeignPath(modulePath, authoredPath.value)
      const sidecarPath = await resolveSafeModuleFile(resolvedAuthoredPath, moduleRoot, projectRoot)
      const relativeSidecarPath = Path.relative(moduleRoot, sidecarPath)
      let group = groups.get(moduleRoot)
      if (!group) {
        group = { moduleRoot, files: new Map(), views: [] }
        groups.set(moduleRoot, group)
      }
      group.views.push({ module, declaration, relativeSidecarPath })
      await collectFileClosure(sidecarPath, group, moduleRoot, projectRoot)
    }
  }
  return [...groups.values()].sort((left, right) => left.moduleRoot.localeCompare(right.moduleRoot))
}

function resolveAuthoredForeignPath(modulePath: string, authoredPath: string): string {
  return Path.resolve(Path.dirname(modulePath), authoredPath)
}

async function collectFileClosure(
  entry: string,
  group: SidecarGroup,
  moduleRoot: string,
  projectDirectory: string,
): Promise<void> {
  const pending = [entry]
  while (pending.length > 0) {
    const path = pending.pop()!
    if (group.files.has(path)) {
      continue
    }
    const safePath = await resolveSafeModuleFile(path, moduleRoot, projectDirectory)
    const contents = await FileSystem.readFile(safePath)
    group.files.set(path, contents)
    if (!isTypeScriptSource(path)) {
      continue
    }
    const source = new TextDecoder().decode(contents)
    for (const specifier of collectModuleSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        continue
      }
      const target = await resolveRelativeImport(Path.resolve(Path.dirname(path), specifier))
      pending.push(await resolveSafeModuleFile(target, moduleRoot, projectDirectory))
    }
  }
}

async function resolveRelativeImport(path: string): Promise<string> {
  const suffixes = ['.tsx', '.ts', '.mts', '.cts', '.jsx', '.js', '.json', ...sidecarAssetExtensions]
  const candidates = getFileExtension(path) ? [path] : [
    ...suffixes.map(suffix => `${path}${suffix}`),
    ...suffixes.map(suffix => Path.join(path, `index${suffix}`)),
  ]
  for (const candidate of candidates) {
    if (await FileSystem.exists(candidate) && FileSystem.lstatSync(candidate).isFile()) {
      return candidate
    }
  }
  Errors.ThrowUserInput(`Cannot resolve foreign view sidecar import: ${path}`)
}

async function resolveSafeModuleFile(path: string, moduleRoot: string, projectDirectory: string): Promise<string> {
  const absolute = Path.resolve(path)
  if (!within(moduleRoot, absolute) || hasDependencyPath(absolute)) {
    Errors.ThrowUserInput(`Foreign view sidecar import crosses its module boundary: ${absolute}`)
  }
  if (!await FileSystem.exists(absolute) || !FileSystem.statSync(absolute).isFile()) {
    Errors.ThrowUserInput(`Foreign view sidecar file is unavailable: ${absolute}`)
  }
  const realPath = resolveRealPathInsideProject(absolute, projectDirectory)
  if (!realPath || !within(moduleRoot, realPath)) {
    Errors.ThrowUserInput(`Foreign view sidecar escapes its module boundary: ${absolute}`)
  }
  const expectedPackage = moduleRoot === projectDirectory ? undefined : moduleRoot
  if (findNamedPackageRoot(realPath, projectDirectory) !== expectedPackage) {
    Errors.ThrowUserInput(`Foreign view sidecar crosses a nested module boundary: ${absolute}`)
  }
  await rejectNestedProjectPath(absolute, moduleRoot, projectDirectory)
  return absolute
}

async function rejectNestedProjectPath(path: string, moduleRoot: string, projectDirectory: string): Promise<void> {
  let current = Path.dirname(path)
  while (within(moduleRoot, current) && current !== moduleRoot) {
    if (current !== projectDirectory && await FileSystem.exists(Path.join(current, '.tao'))) {
      Errors.ThrowUserInput(`Foreign view sidecar crosses a nested Tao project boundary: ${path}`)
    }
    current = Path.dirname(current)
  }
}

function hasDependencyPath(path: string): boolean {
  return Path.resolve(path).split(/[\\/]/).includes('node_modules')
}

function fingerprintFor(
  options: SidecarPipelineOptions,
  nodeModulesDirectory: string,
  groups: readonly SidecarGroup[],
  defaultsContents: string,
): string {
  const files = groups.flatMap(group =>
    [...group.files].map(([path, contents]) => ({
      root: group.moduleRoot,
      path: Path.relative(group.moduleRoot, path),
      content: Platform.hashBytes(contents, 'sha256'),
    }))
  )
  const contracts = groups.flatMap(group =>
    group.views.map(view => ({
      root: group.moduleRoot,
      path: view.relativeSidecarPath,
      name: AST.GetViewName(view.declaration),
      parameters: view.declaration.parameters.map(parameter => [parameter.name.value, parameter.type.value]),
    }))
  )
  return Platform.hashText(JSON.stringify({
    target: options.target,
    dependencyFingerprint: options.dependencyFingerprint,
    nodeModulesDirectory,
    defaults: Platform.hashText(defaultsContents),
    files: files.sort((left, right) => `${left.root}/${left.path}`.localeCompare(`${right.root}/${right.path}`)),
    contracts: contracts.sort((left, right) =>
      `${left.root}/${left.path}/${left.name}`.localeCompare(
        `${right.root}/${right.path}/${right.name}`,
      )
    ),
  }))
}

function isTypeScriptSource(path: string): boolean {
  return ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx'].includes(getFileExtension(path))
}

const createForeignViewKey = (modulePath: string, authoredPath: string) => `${modulePath}\u0000${authoredPath}`
