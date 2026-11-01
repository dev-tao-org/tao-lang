import * as AST from '@ast-gen/AST'
import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import { checkForeignViewContract } from '../sidecars/ForeignViewContracts'
import type { ContractExecutor } from '../sidecars/ForeignViewContracts'
import * as SnapshotIntegrity from './SnapshotIntegrity'

/** SidecarGroup contains all validated source files and views owned by one module root. */
export type SidecarGroup = {
  moduleRoot: string
  files: Map<string, Uint8Array>
  views: ForeignViewInput[]
}

/** SnapshotOptions carries only the compiler contract inputs needed to validate a staging tree. */
export type SnapshotOptions = {
  executor: ContractExecutor
  compiler?: string
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

/** snapshotModuleDirectory maps a source module root to its isolated snapshot directory. */
export function snapshotModuleDirectory(snapshotRoot: string, moduleRoot: string): string {
  return Path.join(snapshotRoot, 'modules', Platform.hashText(moduleRoot).slice(0, 16))
}

/** cachedSnapshotMatches confirms the exact immutable snapshot inventory against captured inputs. */
export async function cachedSnapshotMatches(
  snapshotRoot: string,
  fingerprint: string,
  nodeModulesDirectory: string,
  groups: readonly SidecarGroup[],
  defaultsPath: string,
): Promise<boolean> {
  return await SnapshotIntegrity.cachedSnapshotMatches({
    snapshotRoot,
    fingerprint,
    nodeModulesDirectory,
    groups,
    defaultsPath,
    moduleDirectories: groups.map(group => snapshotModuleDirectory(snapshotRoot, group.moduleRoot)),
  })
}

const DefaultSnapshotLimit = 128

/** buildSnapshot validates inputs in staging before publishing an immutable snapshot. */
export async function buildSnapshot(
  options: SnapshotOptions,
  groups: readonly SidecarGroup[],
  snapshotRoot: string,
  fingerprint: string,
  nodeModulesDirectory: string,
  defaultsPath: string,
  snapshotLimit = DefaultSnapshotLimit,
): Promise<string> {
  await FileSystem.mkdir(Path.dirname(snapshotRoot))
  const recoveryRoot = `${snapshotRoot}.recovered`
  const publishedRoot = resolvePublishedSnapshotRoot(snapshotRoot, recoveryRoot)
  await enforceSnapshotLimit(Path.dirname(snapshotRoot), snapshotLimit)
  const stagingRoot = `${publishedRoot}.${Platform.randomUUID()}.pending`
  await Try(
    () =>
      stageSnapshot({
        options,
        groups,
        snapshotRoot: publishedRoot,
        stagingRoot,
        fingerprint,
        nodeModulesDirectory,
        defaultsPath,
      }),
    {
      finally: () => FileSystem.rm(stagingRoot, { recursive: true, force: true }),
    },
  )
  return publishedRoot
}

async function enforceSnapshotLimit(snapshotDirectory: string, maximum: number): Promise<void> {
  if (!Number.isInteger(maximum) || maximum < 1) {
    Errors.ThrowUserInput(`Foreign view snapshot limit must be a positive integer: ${maximum}`)
  }
  await requireSnapshotCapacity(snapshotDirectory, maximum)
}

async function requireSnapshotCapacity(snapshotDirectory: string, maximum: number): Promise<void> {
  if (await countCompletedSnapshots(snapshotDirectory) >= maximum) {
    Errors.ThrowUserInput(
      `This preview session reached its limit of ${maximum} foreign view snapshots. Restart preview to reclaim sidecar snapshots.`,
    )
  }
}

async function countCompletedSnapshots(snapshotDirectory: string): Promise<number> {
  const entries = await FileSystem.readdir(snapshotDirectory)
  let completed = 0
  for (const entry of entries) {
    if (entry.endsWith('.pending')) {
      continue
    }
    const path = Path.join(snapshotDirectory, entry)
    const metadata = Try.WithDefault(undefined, () => FileSystem.lstatSync(path))
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) {
      completed += 1
    }
  }
  return completed
}

function isPathPresent(path: string): boolean {
  return Try.WithDefault(false, () => {
    FileSystem.lstatSync(path)
    return true
  })
}

type SnapshotStageInput = {
  options: SnapshotOptions
  groups: readonly SidecarGroup[]
  snapshotRoot: string
  stagingRoot: string
  fingerprint: string
  nodeModulesDirectory: string
  defaultsPath: string
}
async function stageSnapshot(input: SnapshotStageInput): Promise<void> {
  await FileSystem.mkdir(input.stagingRoot)
  for (const group of input.groups) {
    await stageModule(input.options, group, input.stagingRoot, input.nodeModulesDirectory, input.defaultsPath)
  }
  await FileSystem.writeFile(
    Path.join(input.stagingRoot, '.tao-sidecar-snapshot.json'),
    serializeSidecarSnapshotMarker(input.fingerprint, input.nodeModulesDirectory),
  )
  await FileSystem.rename(input.stagingRoot, input.snapshotRoot)
}

function serializeSidecarSnapshotMarker(fingerprint: string, nodeModulesDirectory: string): string {
  return `${JSON.stringify({ fingerprint, nodeModulesDirectory }, null, 2)}\n`
}

function resolvePublishedSnapshotRoot(snapshotRoot: string, recoveryRoot: string): string {
  if (!isPathPresent(snapshotRoot)) {
    return snapshotRoot
  }
  if (isPathPresent(recoveryRoot)) {
    return `${recoveryRoot}.${Platform.randomUUID()}`
  }
  return recoveryRoot
}

type ForeignViewInput = {
  module: LinkedProgram['modules'][number]
  declaration: AST.ViewDeclaration
  relativeSidecarPath: string
}

async function stageModule(
  options: SnapshotOptions,
  group: SidecarGroup,
  stagingRoot: string,
  nodeModulesDirectory: string,
  defaultsPath: string,
): Promise<void> {
  const destination = snapshotModuleDirectory(stagingRoot, group.moduleRoot)
  await FileSystem.mkdir(destination)
  await writeModuleMetadata(destination, defaultsPath)
  await FileSystem.symlink(nodeModulesDirectory, Path.join(destination, 'node_modules'), 'dir')
  await copyModuleFiles(group, destination)
  await validateModuleViews(options, group, destination)
}

async function writeModuleMetadata(destination: string, defaultsPath: string): Promise<void> {
  await FileSystem.writeFile(Path.join(destination, 'package.json'), '{"private":true,"type":"module"}\n')
  await FileSystem.writeFile(
    Path.join(destination, 'tsconfig.json'),
    SnapshotIntegrity.createTypeScriptConfigContent(defaultsPath),
  )
  await FileSystem.writeFile(Path.join(destination, 'tao-assets.d.ts'), SnapshotIntegrity.assetDeclarations)
}

async function copyModuleFiles(group: SidecarGroup, destination: string): Promise<void> {
  for (const [source, contents] of group.files) {
    const target = Path.join(destination, Path.relative(group.moduleRoot, source))
    await FileSystem.mkdir(Path.dirname(target))
    await FileSystem.writeFile(target, contents)
  }
}

async function validateModuleViews(
  options: SnapshotOptions,
  group: SidecarGroup,
  destination: string,
): Promise<void> {
  for (const view of group.views) {
    const name = AST.GetViewName(view.declaration)
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
