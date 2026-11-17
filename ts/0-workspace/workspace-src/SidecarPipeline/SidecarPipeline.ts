import * as AST from '@ast-gen'
import { Json } from '@shared'
import { Errors, Lists, Regxs, Sort, Try } from '@shared'
import { Text } from '@shared/os'
import { FS, Path, Platform } from '@shared/os'
import * as Typecheck from '@typecheck'

import * as Paths from '../modules/Paths'
import type { ContractExecutor } from '../sidecars/ForeignViewContracts'
import * as Imports from './Imports'
import * as Snapshots from './Snapshots'

/** SidecarPipelineOptions defines one compiler check and immutable sidecar snapshot. */
export type SidecarPipelineOptions = {
  program: Typecheck.LinkedProgram
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
  const nodeModulesDirectory = FS.realpathSync(options.nodeModulesDirectory)
  const { groups, watchFiles } = await collectSidecarInputs(options)
  await options.onWatchFiles?.(watchFiles)
  const defaultsPath = resolveTypeScriptDefaultsPath(options)
  const defaultsContents = await FS.readFile(defaultsPath, 'utf8')
  const fingerprint = fingerprintFor(options, nodeModulesDirectory, groups, defaultsContents)
  const requestedSnapshotRoot = Path.join(options.sessionBuildDirectory, 'foreign-views', fingerprint)
  const cachedRoot = await Snapshots.findCachedSnapshot(
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
      const key = Typecheck.createModuleMemberKey(absoluteModulePath, resolvedAuthoredPath)
      return pathMap.get(key) ?? Errors.ThrowUserInput(`Foreign view path was not validated: ${authoredPath}`)
    },
    watchDirectories: Lists.unique(groups.flatMap(group => [...group.files.keys()].map(Path.dirname))).sort(
      Sort.CompareStrings,
    ),
    watchFiles,
    snapshotDirectories: [snapshotRoot, ...snapshotDirectories],
  }
}

/** collectLibrarySidecars captures the same bounded source closure for relocatable library publication. */
export async function collectLibrarySidecars(
  program: Typecheck.LinkedProgram,
  projectDirectory: string,
): Promise<readonly Snapshots.SidecarGroup[]> {
  const { groups } = await collectSidecarInputs({ program, projectDirectory })
  return groups
}

function resolveTypeScriptDefaultsPath(options: SidecarPipelineOptions): string {
  const projectDirectory = options.projectDirectory === undefined
    ? Path.dirname(options.program.entry)
    : options.projectDirectory
  return options.typescriptDefaultsPath === undefined
    ? Path.join(projectDirectory, '.tao/cache/sidecars/typescript-defaults.json')
    : options.typescriptDefaultsPath
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
      if (authoredPath === undefined) {
        Errors.Throw(`Expected a foreign view render for ${AST.GetViewName(view.declaration)}.`)
      }
      pathMap.set(
        Typecheck.createModuleMemberKey(
          view.module.path,
          resolveAuthoredForeignPath(view.module.path, authoredPath.value),
        ),
        Path.join(directory, view.relativeSidecarPath),
      )
    }
  })
  return pathMap
}

type CollectedSidecarInputs = { groups: Snapshots.SidecarGroup[]; watchFiles: string[] }
type SidecarInputField = 'program' | 'projectDirectory' | 'onWatchFiles'
type SidecarInputOptions = Pick<SidecarPipelineOptions, SidecarInputField>
async function collectSidecarInputs(options: SidecarInputOptions): Promise<CollectedSidecarInputs> {
  const entryPath = options.program.entry
  const projectDirectory = options.projectDirectory
    ? Path.resolve(options.projectDirectory)
    : Paths.findNearestProjectRoot(Path.dirname(entryPath)) ?? Path.dirname(entryPath)
  const canonicalConsumerDirectory = FS.realpathSync(projectDirectory)
  const groups = new Map<string, Snapshots.SidecarGroup>()
  const watchFiles = new Set<string>()
  return await Try(
    async () => {
      await collectProgramSidecarViews(options, canonicalConsumerDirectory, groups, watchFiles)
      const sortedGroups = [...groups.values()].sort(compareSidecarModuleRoots)
      const sortedWatchFiles = [...watchFiles].sort(Sort.CompareStrings)
      return {
        groups: sortedGroups,
        watchFiles: sortedWatchFiles,
      }
    },
    {
      async catch(error) {
        await options.onWatchFiles?.([...watchFiles].sort(Sort.CompareStrings))
        Errors.Throw(error)
      },
    },
  )
}

function compareSidecarModuleRoots(left: Snapshots.SidecarGroup, right: Snapshots.SidecarGroup): number {
  return left.moduleRoot.localeCompare(right.moduleRoot)
}

async function collectProgramSidecarViews(
  options: SidecarInputOptions,
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
  module: Typecheck.LinkedProgram['modules'][number],
  declaration: AST.ViewDeclaration,
  canonicalConsumerDirectory: string,
  groups: Map<string, Snapshots.SidecarGroup>,
  watchFiles: Set<string>,
): Promise<void> {
  const authoredPath = AST.GetForeignViewPath(declaration)
  if (authoredPath === undefined) {
    return
  }
  const modulePath = FS.realpathSync(Path.resolve(module.path))
  const projectRoot = FS.realpathSync(
    Paths.findNearestProjectRoot(Path.dirname(modulePath)) ?? canonicalConsumerDirectory,
  )
  const realModulePath = Paths.resolveRealPathInsideProject(modulePath, projectRoot)
  if (realModulePath === undefined) {
    Errors.ThrowUserInput(`Tao module is outside its project boundary: ${modulePath}`)
  }
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
    const contents = await FS.readFile(safePath)
    group.files.set(path, contents)
    if (!Imports.isScriptSource(path)) {
      continue
    }
    const declaration = await Imports.findScriptDeclaration(
      path,
      candidate => watchAttemptedPath(candidate, moduleRoot, watchFiles),
    )
    if (declaration) {
      pending.push(declaration)
    }
    const source = Text.decodeUtf8(contents)
    for (const specifier of Imports.collectModuleSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        continue
      }
      const target = await Imports.resolveRelativeImport(
        Path.resolve(Path.dirname(path), specifier),
        candidate => watchAttemptedPath(candidate, moduleRoot, watchFiles),
      )
      pending.push(await resolveSafeModuleFile(target, moduleRoot, projectDirectory))
    }
  }
}

async function resolveSafeModuleFile(path: string, moduleRoot: string, projectDirectory: string): Promise<string> {
  const absolute = Path.resolve(path)
  requireModulePathInsideSidecar(moduleRoot, absolute)
  await requireAvailableSidecarFile(absolute)
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

function requireModulePathInsideSidecar(moduleRoot: string, absolute: string): void {
  if (!Paths.within(moduleRoot, absolute) || hasDependencyPath(absolute)) {
    Errors.ThrowUserInput(`Foreign view sidecar import crosses its module boundary: ${absolute}`)
  }
}

async function requireAvailableSidecarFile(absolute: string): Promise<void> {
  if (!await FS.exists(absolute) || !FS.statSync(absolute).isFile()) {
    Errors.ThrowUserInput(`Foreign view sidecar file is unavailable: ${absolute}`)
  }
}

async function rejectNestedProjectPath(path: string, moduleRoot: string, projectDirectory: string): Promise<void> {
  let current = Path.dirname(path)
  while (Paths.within(moduleRoot, current) && current !== moduleRoot) {
    if (current !== projectDirectory && await FS.exists(Path.join(current, '.tao'))) {
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
  return Platform.hashText(Json.Print({
    target: options.target,
    dependencyFingerprint: options.dependencyFingerprint,
    nodeModulesDirectory,
    defaults: Platform.hashText(defaultsContents),
    files: files.sort((left, right) => `${left.root}/${left.path}`.localeCompare(`${right.root}/${right.path}`)),
    contracts: contracts.sort((left, right) =>
      `${left.root}/${left.path}/${left.name}`.localeCompare(`${right.root}/${right.path}/${right.name}`)
    ),
  }, { prettyPrint: false }))
}
