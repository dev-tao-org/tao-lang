import * as AST from '@ast-gen/AST'
import { Errors, S, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import { checkForeignViewContract } from '../sidecars/ForeignViewContracts'
import type { ContractExecutor } from '../sidecars/ForeignViewContracts'

type ForeignViewInput = {
  module: LinkedProgram['modules'][number]
  declaration: AST.ViewDeclaration
  relativeSidecarPath: string
}

/** SidecarGroup contains all validated source files and views owned by one module root. */
export type SidecarGroup = {
  moduleRoot: string
  files: Map<string, Uint8Array>
  views: ForeignViewInput[]
}

/** snapshotModuleDirectory maps a source module root to its isolated snapshot directory. */
export function snapshotModuleDirectory(snapshotRoot: string, moduleRoot: string): string {
  return Path.join(snapshotRoot, 'modules', Platform.hashText(moduleRoot).slice(0, 16))
}

/** cachedSnapshotMatches confirms a content snapshot and its managed package link are intact. */
export async function cachedSnapshotMatches(
  snapshotRoot: string,
  fingerprint: string,
  nodeModulesDirectory: string,
  moduleDirectories: readonly string[],
): Promise<boolean> {
  const markerPath = Path.join(snapshotRoot, '.tao-sidecar-snapshot.json')
  if (!await FileSystem.exists(markerPath)) {
    return false
  }
  const marker = JSON.parse(await FileSystem.readFile(markerPath, 'utf8')) as { fingerprint?: string }
  if (marker.fingerprint !== fingerprint) {
    Errors.ThrowUserInput(`Foreign view snapshot identity is invalid: ${snapshotRoot}`)
  }
  return moduleDirectories.every(directory => {
    const nodeModules = Path.join(directory, 'node_modules')
    return FileSystem.existsSync(nodeModules)
      && FileSystem.realpathSync(nodeModules) === nodeModulesDirectory
  })
}

/** buildSnapshot validates inputs in staging before publishing an immutable snapshot. */
export async function buildSnapshot(
  options: SnapshotOptions,
  groups: readonly SidecarGroup[],
  snapshotRoot: string,
  fingerprint: string,
  nodeModulesDirectory: string,
  defaultsPath: string,
): Promise<void> {
  await FileSystem.mkdir(Path.dirname(snapshotRoot), { recursive: true })
  if (await FileSystem.exists(snapshotRoot)) {
    Errors.ThrowUserInput(`An incomplete foreign view snapshot already occupies ${snapshotRoot}`)
  }
  const stagingRoot = `${snapshotRoot}.${Platform.randomUUID()}.pending`
  await Try(
    () =>
      stageSnapshot({ options, groups, snapshotRoot, stagingRoot, fingerprint, nodeModulesDirectory, defaultsPath }),
    {
      finally: () => FileSystem.rm(stagingRoot, { recursive: true, force: true }),
    },
  )
}

/** SnapshotOptions carries only the compiler contract inputs needed to validate a staging tree. */
export type SnapshotOptions = {
  executor: ContractExecutor
  compiler?: string
}

async function stageSnapshot(input: {
  options: SnapshotOptions
  groups: readonly SidecarGroup[]
  snapshotRoot: string
  stagingRoot: string
  fingerprint: string
  nodeModulesDirectory: string
  defaultsPath: string
}): Promise<void> {
  await FileSystem.mkdir(input.stagingRoot, { recursive: true })
  for (const group of input.groups) {
    await stageModule(input.options, group, input.stagingRoot, input.nodeModulesDirectory, input.defaultsPath)
  }
  const marker = JSON.stringify(
    { fingerprint: input.fingerprint, nodeModulesDirectory: input.nodeModulesDirectory },
    null,
    2,
  )
  await FileSystem.writeFile(Path.join(input.stagingRoot, '.tao-sidecar-snapshot.json'), `${marker}\n`)
  await FileSystem.rename(input.stagingRoot, input.snapshotRoot)
}

async function stageModule(
  options: SnapshotOptions,
  group: SidecarGroup,
  stagingRoot: string,
  nodeModulesDirectory: string,
  defaultsPath: string,
): Promise<void> {
  const destination = snapshotModuleDirectory(stagingRoot, group.moduleRoot)
  await FileSystem.mkdir(destination, { recursive: true })
  await writeModuleMetadata(destination, defaultsPath)
  await FileSystem.symlink(nodeModulesDirectory, Path.join(destination, 'node_modules'), 'dir')
  await copyModuleFiles(group, destination)
  await validateModuleViews(options, group, destination)
}

async function writeModuleMetadata(destination: string, defaultsPath: string): Promise<void> {
  await FileSystem.writeFile(Path.join(destination, 'package.json'), '{"private":true,"type":"module"}\n')
  const config = {
    extends: FileSystem.realpathSync(defaultsPath),
    include: ['**/*.ts', '**/*.tsx', '.tao-*.contract.ts', 'tao-assets.d.ts'],
  }
  await FileSystem.writeFile(Path.join(destination, 'tsconfig.json'), `${JSON.stringify(config, null, 2)}\n`)
  await FileSystem.writeFile(Path.join(destination, 'tao-assets.d.ts'), assetDeclarations)
}

async function copyModuleFiles(group: SidecarGroup, destination: string): Promise<void> {
  for (const [source, contents] of group.files) {
    const target = Path.join(destination, Path.relative(group.moduleRoot, source))
    await FileSystem.mkdir(Path.dirname(target), { recursive: true })
    await FileSystem.writeFile(target, contents)
  }
}

async function validateModuleViews(
  options: SnapshotOptions,
  group: SidecarGroup,
  destination: string,
): Promise<void> {
  for (const view of group.views) {
    const name = view.declaration.name.value
    if (view.declaration.parameters.some(parameter => parameter.type.value !== 'text')) {
      Errors.ThrowUserInput(`Foreign view ${name} parameters must all use text.`)
    }
    await checkForeignViewContract({
      directory: destination,
      name,
      parameters: Object.fromEntries(view.declaration.parameters.map(parameter => [parameter.name.value, 'string'])),
      exportFile: Path.join(destination, view.relativeSidecarPath),
      compiler: options.compiler ?? 'tsc',
    }, options.executor)
  }
}

/** sidecarAssetExtensions lists supported copied binary asset suffixes. */
export const sidecarAssetExtensions = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.mp3',
  '.ttf',
  '.woff',
  '.woff2',
  '.pdf',
]

const assetDeclarations = S`
  declare module '*.png' { const asset: number; export default asset }
  declare module '*.jpg' { const asset: number; export default asset }
  declare module '*.jpeg' { const asset: number; export default asset }
  declare module '*.gif' { const asset: number; export default asset }
  declare module '*.webp' { const asset: number; export default asset }
  declare module '*.svg' { const asset: number; export default asset }
  declare module '*.mp4' { const asset: number; export default asset }
  declare module '*.mp3' { const asset: number; export default asset }
  declare module '*.ttf' { const asset: number; export default asset }
  declare module '*.woff' { const asset: number; export default asset }
  declare module '*.woff2' { const asset: number; export default asset }
  declare module '*.pdf' { const asset: number; export default asset }
`
