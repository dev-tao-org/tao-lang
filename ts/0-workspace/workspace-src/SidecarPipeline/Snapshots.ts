import * as AST from '@ast-gen'
import * as Compile from '@compile'
import { Errors, Json, NewlineCharacter, Sort, Try } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import type * as Typecheck from '@typecheck'

import { checkForeignViewContract } from '../sidecars/ForeignViewContracts'
import type { ContractExecutor } from '../sidecars/ForeignViewContracts'
import { SidecarAssetDeclarations } from '../sidecars/SidecarAssets'
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

/** snapshotModuleDirectory maps a source module root to its isolated snapshot directory. */
export function snapshotModuleDirectory(snapshotRoot: string, moduleRoot: string): string {
  return Path.join(snapshotRoot, 'modules', Platform.hashText(moduleRoot).slice(0, 16))
}

/** findCachedSnapshot selects an exact or recovered snapshot whose complete inputs still match. */
export async function findCachedSnapshot(
  requestedRoot: string,
  groups: readonly SidecarGroup[],
  fingerprint: string,
  nodeModulesDirectory: string,
  defaultsPath: string,
): Promise<string | undefined> {
  if (await cachedSnapshotMatches(requestedRoot, fingerprint, nodeModulesDirectory, groups, defaultsPath)) {
    return requestedRoot
  }
  const parent = Path.dirname(requestedRoot)
  const recoveryPrefix = `${Path.basename(requestedRoot)}.recovered`
  const siblings = await Try.WithDefault<Promise<string[]>, string[]>([], () => FS.readdir(parent))
  const candidates = siblings.filter(name => name.startsWith(recoveryPrefix)).sort(Sort.CompareStrings)
    .map(name => Path.join(parent, name))
  for (const candidate of candidates) {
    if (await cachedSnapshotMatches(candidate, fingerprint, nodeModulesDirectory, groups, defaultsPath)) {
      return candidate
    }
  }
  return undefined
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
  await FS.mkdir(Path.dirname(snapshotRoot))
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
      finally: () => FS.rm(stagingRoot, { recursive: true, force: true }),
    },
  )
  return publishedRoot
}

async function cachedSnapshotMatches(
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
  const entries = await FS.readdir(snapshotDirectory)
  let completed = 0
  for (const entry of entries) {
    if (entry.endsWith('.pending')) {
      continue
    }
    const path = Path.join(snapshotDirectory, entry)
    const metadata = Try.WithDefault(undefined, () => FS.lstatSync(path))
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) {
      completed += 1
    }
  }
  return completed
}

function isPathPresent(path: string): boolean {
  return Try.WithDefault(false, () => {
    FS.lstatSync(path)
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
  await FS.mkdir(input.stagingRoot)
  for (const group of input.groups) {
    await stageModule(input.options, group, input.stagingRoot, input.nodeModulesDirectory, input.defaultsPath)
  }
  await FS.writeFile(
    Path.join(input.stagingRoot, '.tao-sidecar-snapshot.json'),
    serializeSidecarSnapshotMarker(input.fingerprint, input.nodeModulesDirectory),
  )
  await FS.rename(input.stagingRoot, input.snapshotRoot)
}

function serializeSidecarSnapshotMarker(fingerprint: string, nodeModulesDirectory: string): string {
  return `${Json.Print({ fingerprint, nodeModulesDirectory })}${NewlineCharacter}`
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
  module: Typecheck.LinkedProgram['modules'][number]
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
  await FS.mkdir(destination)
  await writeModuleMetadata(destination, defaultsPath)
  await FS.symlink(nodeModulesDirectory, Path.join(destination, 'node_modules'), 'dir')
  await copyModuleFiles(group, destination)
  await validateModuleViews(options, group, destination)
}

async function writeModuleMetadata(destination: string, defaultsPath: string): Promise<void> {
  await FS.writeFile(
    Path.join(destination, 'package.json'),
    '{"private":true,"type":"module"}' + NewlineCharacter,
  )
  await FS.writeFile(
    Path.join(destination, 'tsconfig.json'),
    SnapshotIntegrity.createTypeScriptConfigContent(defaultsPath),
  )
  await FS.writeFile(Path.join(destination, 'tao-assets.d.ts'), SidecarAssetDeclarations)
}

async function copyModuleFiles(group: SidecarGroup, destination: string): Promise<void> {
  for (const [source, contents] of group.files) {
    const target = Path.join(destination, Path.relative(group.moduleRoot, source))
    await FS.mkdir(Path.dirname(target))
    await FS.writeFile(target, contents)
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
      parameters: Compile.projectTextViewParameterTypes(view.declaration),
      exportFile: Path.join(destination, view.relativeSidecarPath),
      compiler: options.compiler ?? 'tsc',
    }, options.executor)
  }
}
