import * as AST from '@ast-gen/AST'
import { Errors, Regxs, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { createModuleMemberKey, type LinkedProgram } from '@typecheck/Modules'
import * as Paths from './modules/Paths'
import { collectModuleSpecifiers, getFileExtension } from './sidecar-pipeline/Imports'
import * as Snapshots from './sidecar-pipeline/Snapshots'
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
  onWatchFiles?: (files: readonly string[]) => Promise<void>
}

/** PreparedSidecars exposes only validated snapshots to generated app compilation. */
export type PreparedSidecars = {
  fingerprint: string
  resolveForeignViewPath(modulePath: string, authoredPath: string): string
  watchDirectories: readonly string[]
  watchFiles: readonly string[]
  snapshotDirectories: readonly string[]
}

/** prepareSidecarPipeline snapshots foreign view inputs and validates their named exports. */
export async function prepareSidecarPipeline(options: SidecarPipelineOptions): Promise<PreparedSidecars> {
  const nodeModulesDirectory = FileSystem.realpathSync(options.nodeModulesDirectory)
  const { groups, watchFiles } = await collectSidecarInputs(options)
  await options.onWatchFiles?.(watchFiles)
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
    defaultsPath,
  )
  let snapshotRoot = cachedRoot ?? requestedSnapshotRoot
  let snapshotDirectories = groups.map(group => Snapshots.snapshotModuleDirectory(snapshotRoot, group.moduleRoot))
  if (!cachedRoot) {
    snapshotRoot = await Snapshots.buildSnapshot(
      options,
      groups,
      requestedSnapshotRoot,
      fingerprint,
      nodeModulesDirectory,
      defaultsPath,
      options.snapshotLimit,
    )
    snapshotDirectories = groups.map(group => Snapshots.snapshotModuleDirectory(snapshotRoot, group.moduleRoot))
  }
  const pathMap = snapshotForeignViewPaths(groups, snapshotDirectories)
  return {
    fingerprint,
    resolveForeignViewPath(modulePath, authoredPath) {
      const absoluteModulePath = Path.resolve(modulePath)
      const resolvedAuthoredPath = resolveAuthoredForeignPath(absoluteModulePath, authoredPath)
      const key = createModuleMemberKey(absoluteModulePath, resolvedAuthoredPath)
      return pathMap.get(key) ?? Errors.ThrowUserInput(`Foreign view path was not validated: ${authoredPath}`)
    },
    watchDirectories: [...new Set(groups.flatMap(group => [...group.files.keys()].map(Path.dirname)))].sort(),
    watchFiles,
    snapshotDirectories: [snapshotRoot, ...snapshotDirectories],
  }
}

function snapshotForeignViewPaths(
  groups: readonly Snapshots.SidecarGroup[],
  directories: readonly string[],
): Map<string, string> {
  const pathMap = new Map<string, string>()
  groups.forEach((group, index) => {
    const directory = directories[index]!
    for (const view of group.views) {
      const authoredPath = AST.GetForeignViewPath(view.declaration)
        ?? Errors.Throw(`Expected a foreign view render for ${AST.GetViewName(view.declaration)}.`)
      pathMap.set(
        createModuleMemberKey(view.module.path, resolveAuthoredForeignPath(view.module.path, authoredPath.value)),
        Path.join(directory, view.relativeSidecarPath),
      )
    }
  })
  return pathMap
}

async function findCachedSnapshot(
  requestedRoot: string,
  groups: readonly Snapshots.SidecarGroup[],
  fingerprint: string,
  nodeModulesDirectory: string,
  defaultsPath: string,
): Promise<string | undefined> {
  if (await Snapshots.cachedSnapshotMatches(requestedRoot, fingerprint, nodeModulesDirectory, groups, defaultsPath)) {
    return requestedRoot
  }
  const parent = Path.dirname(requestedRoot)
  const recoveryPrefix = `${Path.basename(requestedRoot)}.recovered`
  const siblings = await Try.WithDefault<Promise<string[]>, string[]>([], () => FileSystem.readdir(parent))
  const candidates = siblings.filter(name => name.startsWith(recoveryPrefix)).sort()
    .map(name => Path.join(parent, name))
  for (const candidate of candidates) {
    if (await Snapshots.cachedSnapshotMatches(candidate, fingerprint, nodeModulesDirectory, groups, defaultsPath)) {
      return candidate
    }
  }
  return undefined
}

async function collectSidecarInputs(options: SidecarPipelineOptions): Promise<CollectedSidecarInputs> {
  const entryPath = options.program.entry
  const projectDirectory = options.projectDirectory
    ? Path.resolve(options.projectDirectory)
    : Paths.findNearestProjectRoot(Path.dirname(entryPath)) ?? Path.dirname(entryPath)
  const canonicalConsumerDirectory = FileSystem.realpathSync(projectDirectory)
  const groups = new Map<string, Snapshots.SidecarGroup>()
  const watchFiles = new Set<string>()
  return await Try(
    async () => {
      await collectProgramSidecarViews(options, canonicalConsumerDirectory, groups, watchFiles)
      return {
        groups: [...groups.values()].sort((left, right) => left.moduleRoot.localeCompare(right.moduleRoot)),
        watchFiles: [...watchFiles].sort(),
      }
    },
    {
      async catch(error) {
        await options.onWatchFiles?.([...watchFiles].sort())
        Errors.Throw(error)
      },
    },
  )
}

async function collectProgramSidecarViews(
  options: SidecarPipelineOptions,
  canonicalConsumerDirectory: string,
  groups: Map<string, Snapshots.SidecarGroup>,
  watchFiles: Set<string>,
): Promise<void> {
  for (const module of options.program.modules) {
    for (const declaration of AST.GetAllViewDeclarations(module.document)) {
      await collectSidecarView(module, declaration, canonicalConsumerDirectory, groups, watchFiles)
    }
  }
}

async function collectSidecarView(
  module: LinkedProgram['modules'][number],
  declaration: AST.ViewDeclaration,
  canonicalConsumerDirectory: string,
  groups: Map<string, Snapshots.SidecarGroup>,
  watchFiles: Set<string>,
): Promise<void> {
  const authoredPath = AST.GetForeignViewPath(declaration)
  if (authoredPath === undefined) {
    return
  }
  const modulePath = FileSystem.realpathSync(Path.resolve(module.path))
  const projectRoot = FileSystem.realpathSync(
    Paths.findNearestProjectRoot(Path.dirname(modulePath)) ?? canonicalConsumerDirectory,
  )
  const realModulePath = Paths.resolveRealPathInsideProject(modulePath, projectRoot)
    ?? Errors.ThrowUserInput(`Tao module is outside its project boundary: ${modulePath}`)
  const moduleRoot = Paths.findNamedPackageRoot(realModulePath, projectRoot) ?? projectRoot
  const resolvedAuthoredPath = resolveAuthoredForeignPath(modulePath, authoredPath.value)
  watchAttemptedPath(resolvedAuthoredPath, moduleRoot, watchFiles)
  const sidecarPath = await resolveSafeModuleFile(resolvedAuthoredPath, moduleRoot, projectRoot)
  watchFiles.add(sidecarPath)
  const relativeSidecarPath = Path.relative(moduleRoot, sidecarPath)
  const group = findOrCreateSidecarGroup(groups, moduleRoot)
  group.views.push({ module, declaration, relativeSidecarPath })
  await collectFileClosure(sidecarPath, group, moduleRoot, projectRoot, watchFiles)
}

function watchAttemptedPath(path: string, moduleRoot: string, watchFiles: Set<string>): void {
  if (Paths.within(moduleRoot, path) && !hasDependencyPath(path)) {
    watchFiles.add(path)
  }
}

function findOrCreateSidecarGroup(
  groups: Map<string, Snapshots.SidecarGroup>,
  moduleRoot: string,
): Snapshots.SidecarGroup {
  let group = groups.get(moduleRoot)
  if (!group) {
    group = { moduleRoot, files: new Map(), views: [] }
    groups.set(moduleRoot, group)
  }
  return group
}

function resolveAuthoredForeignPath(modulePath: string, authoredPath: string): string {
  return Path.resolve(Path.dirname(modulePath), authoredPath)
}

async function collectFileClosure(
  entry: string,
  group: Snapshots.SidecarGroup,
  moduleRoot: string,
  projectDirectory: string,
  watchFiles: Set<string>,
): Promise<void> {
  const pending = [entry]
  while (pending.length > 0) {
    const path = pending.pop()!
    if (group.files.has(path)) {
      continue
    }
    const safePath = await resolveSafeModuleFile(path, moduleRoot, projectDirectory)
    watchFiles.add(safePath)
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
      const target = await resolveRelativeImport(Path.resolve(Path.dirname(path), specifier), moduleRoot, watchFiles)
      pending.push(await resolveSafeModuleFile(target, moduleRoot, projectDirectory))
    }
  }
}

async function resolveRelativeImport(path: string, moduleRoot: string, watchFiles: Set<string>): Promise<string> {
  const suffixes = ['.tsx', '.ts', '.mts', '.cts', '.jsx', '.js', '.json', ...Snapshots.sidecarAssetExtensions]
  const candidates = getFileExtension(path) ? [path] : [
    ...suffixes.map(suffix => `${path}${suffix}`),
    ...suffixes.map(suffix => Path.join(path, `index${suffix}`)),
  ]
  for (const candidate of candidates) {
    watchAttemptedPath(candidate, moduleRoot, watchFiles)
    if (await FileSystem.exists(candidate) && FileSystem.lstatSync(candidate).isFile()) {
      return candidate
    }
  }
  Errors.ThrowUserInput(`Cannot resolve foreign view sidecar import: ${path}`)
}

type CollectedSidecarInputs = { groups: Snapshots.SidecarGroup[]; watchFiles: string[] }

async function resolveSafeModuleFile(path: string, moduleRoot: string, projectDirectory: string): Promise<string> {
  const absolute = Path.resolve(path)
  if (!Paths.within(moduleRoot, absolute) || hasDependencyPath(absolute)) {
    Errors.ThrowUserInput(`Foreign view sidecar import crosses its module boundary: ${absolute}`)
  }
  if (!await FileSystem.exists(absolute) || !FileSystem.statSync(absolute).isFile()) {
    Errors.ThrowUserInput(`Foreign view sidecar file is unavailable: ${absolute}`)
  }
  const realPath = Paths.resolveRealPathInsideProject(absolute, projectDirectory)
  if (!realPath || !Paths.within(moduleRoot, realPath)) {
    Errors.ThrowUserInput(`Foreign view sidecar escapes its module boundary: ${absolute}`)
  }
  const expectedPackage = moduleRoot === projectDirectory ? undefined : moduleRoot
  if (Paths.findNamedPackageRoot(realPath, projectDirectory) !== expectedPackage) {
    Errors.ThrowUserInput(`Foreign view sidecar crosses a nested module boundary: ${absolute}`)
  }
  await rejectNestedProjectPath(absolute, moduleRoot, projectDirectory)
  return absolute
}

async function rejectNestedProjectPath(path: string, moduleRoot: string, projectDirectory: string): Promise<void> {
  let current = Path.dirname(path)
  while (Paths.within(moduleRoot, current) && current !== moduleRoot) {
    if (current !== projectDirectory && await FileSystem.exists(Path.join(current, '.tao'))) {
      Errors.ThrowUserInput(`Foreign view sidecar crosses a nested Tao project boundary: ${path}`)
    }
    current = Path.dirname(current)
  }
}

function hasDependencyPath(path: string): boolean {
  return Path.resolve(path).split(Regxs.PathSeparatorRegx).includes('node_modules')
}

function fingerprintFor(
  options: SidecarPipelineOptions,
  nodeModulesDirectory: string,
  groups: readonly Snapshots.SidecarGroup[],
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
