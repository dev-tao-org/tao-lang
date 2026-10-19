import * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import { namedPackageRoot, nearestProjectRoot, realPathInsideProject, within } from './modules/Paths'
import { fileExtension, moduleSpecifiers } from './sidecar-pipeline/Imports'
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
}

/** PreparedSidecars exposes only validated snapshots to generated app compilation. */
export type PreparedSidecars = {
  fingerprint: string
  foreignViewPath(modulePath: string, authoredPath: string): string
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
  const snapshotRoot = Path.join(options.sessionBuildDirectory, 'foreign-views', fingerprint)
  const snapshotDirectories = groups.map(group => snapshotModuleDirectory(snapshotRoot, group.moduleRoot))
  if (!await cachedSnapshotMatches(snapshotRoot, fingerprint, nodeModulesDirectory, snapshotDirectories)) {
    await buildSnapshot(options, groups, snapshotRoot, fingerprint, nodeModulesDirectory, defaultsPath)
  }
  const pathMap = new Map<string, string>()
  groups.forEach((group, index) => {
    const snapshotDirectory = snapshotDirectories[index]!
    for (const view of group.views) {
      const render = AST.IsKind(view.declaration.render, 'ForeignView')
        ? view.declaration.render
        : Errors.Throw(`Expected a foreign view render for ${view.declaration.name.value}.`)
      const authored = authoredForeignPath(view.module.path, render)
      pathMap.set(foreignViewKey(view.module.path, authored), Path.join(snapshotDirectory, view.relativeSidecarPath))
    }
  })
  return {
    fingerprint,
    foreignViewPath(modulePath, authoredPath) {
      const key = foreignViewKey(Path.resolve(modulePath), Path.resolve(Path.dirname(modulePath), authoredPath))
      return pathMap.get(key) ?? Errors.ThrowUserInput(`Foreign view path was not validated: ${authoredPath}`)
    },
    watchDirectories: [...new Set(groups.flatMap(group => [...group.files.keys()].map(Path.dirname)))].sort(),
    snapshotDirectories: [snapshotRoot, ...snapshotDirectories],
  }
}

async function collectSidecarInputs(options: SidecarPipelineOptions): Promise<SidecarGroup[]> {
  const entryPath = options.program.entry
  const projectDirectory = options.projectDirectory
    ? Path.resolve(options.projectDirectory)
    : nearestProjectRoot(Path.dirname(entryPath)) ?? Path.dirname(entryPath)
  const canonicalConsumerDirectory = FileSystem.realpathSync(projectDirectory)
  const groups = new Map<string, SidecarGroup>()
  for (const module of options.program.modules) {
    for (const declaration of module.document.root.declarations.filter(AST.IsViewDeclaration)) {
      if (!AST.IsKind(declaration.render, 'ForeignView')) {
        continue
      }
      const modulePath = Path.resolve(module.path)
      const projectRoot = FileSystem.realpathSync(
        nearestProjectRoot(Path.dirname(modulePath)) ?? canonicalConsumerDirectory,
      )
      const realModulePath = realPathInsideProject(modulePath, projectRoot)
        ?? Errors.ThrowUserInput(`Tao module is outside its project boundary: ${modulePath}`)
      const moduleRoot = namedPackageRoot(realModulePath, projectRoot) ?? projectRoot
      const authoredPath = authoredForeignPath(modulePath, declaration.render)
      const sidecarPath = await safeModuleFile(authoredPath, moduleRoot, projectRoot)
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

function authoredForeignPath(modulePath: string, render: AST.ForeignView): string {
  return Path.resolve(Path.dirname(modulePath), render.path.value)
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
    const safePath = await safeModuleFile(path, moduleRoot, projectDirectory)
    const contents = await FileSystem.readFile(safePath)
    group.files.set(path, contents)
    if (!isTypeScriptSource(path)) {
      continue
    }
    const source = new TextDecoder().decode(contents)
    for (const specifier of moduleSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        continue
      }
      const target = await resolveRelativeImport(Path.resolve(Path.dirname(path), specifier))
      pending.push(await safeModuleFile(target, moduleRoot, projectDirectory))
    }
  }
}

async function resolveRelativeImport(path: string): Promise<string> {
  const suffixes = ['.tsx', '.ts', '.mts', '.cts', '.jsx', '.js', '.json', ...sidecarAssetExtensions]
  const candidates = fileExtension(path) ? [path] : [
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

async function safeModuleFile(path: string, moduleRoot: string, projectDirectory: string): Promise<string> {
  const absolute = Path.resolve(path)
  if (!within(moduleRoot, absolute) || hasDependencyPath(absolute)) {
    Errors.ThrowUserInput(`Foreign view sidecar import crosses its module boundary: ${absolute}`)
  }
  if (!await FileSystem.exists(absolute) || !FileSystem.statSync(absolute).isFile()) {
    Errors.ThrowUserInput(`Foreign view sidecar file is unavailable: ${absolute}`)
  }
  const realPath = realPathInsideProject(absolute, projectDirectory)
  if (!realPath || !within(moduleRoot, realPath)) {
    Errors.ThrowUserInput(`Foreign view sidecar escapes its module boundary: ${absolute}`)
  }
  const expectedPackage = moduleRoot === projectDirectory ? undefined : moduleRoot
  if (namedPackageRoot(realPath, projectDirectory) !== expectedPackage) {
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
      name: view.declaration.name.value,
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
  return ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx'].includes(fileExtension(path))
}

const foreignViewKey = (modulePath: string, authoredPath: string) => `${modulePath}\u0000${authoredPath}`
