import * as AST from '@ast-gen'
import * as Compile from '@compile'
import { Json } from '@shared'
import { NewlineCharacter, Try } from '@shared'
import { Text } from '@shared/os'
import { FS, Path } from '@shared/os'
import { ForeignViewContractOwnership } from '../sidecars/ForeignViewContracts'
import { SidecarAssetDeclarations } from '../sidecars/SidecarAssets'
import type { SidecarGroup } from './Snapshots'

/** cachedSnapshotMatches verifies captured content, inventory, and the managed package links. */
export async function cachedSnapshotMatches(input: CacheValidationInput): Promise<boolean> {
  const markerPath = Path.join(input.snapshotRoot, '.tao-sidecar-snapshot.json')
  if (isSymbolicLink(input.snapshotRoot) || isSymbolicLink(markerPath) || !await FS.exists(markerPath)) {
    return false
  }
  const parsedMarker = Try.WithDefault(
    undefined,
    () => parseSidecarSnapshotMarker(FS.readFileSync(markerPath, 'utf8')),
  )
  const marker = parsedMarker as OptionalSnapshotMarker
  if (marker?.fingerprint !== input.fingerprint || marker.nodeModulesDirectory !== input.nodeModulesDirectory) {
    return false
  }
  const expectedFiles = collectExpectedSnapshotFiles(input)
  return await Try(
    () => snapshotInventoryMatches(input, expectedFiles),
    { catch: () => false },
  )
}

/** createTypeScriptConfigContent returns the generated module configuration bytes. */
export function createTypeScriptConfigContent(defaultsPath: string): string {
  return `${
    Json.Print({
      extends: FS.realpathSync(defaultsPath),
      compilerOptions: { baseUrl: '.' },
      include: ['**/*.ts', '**/*.tsx', '.tao-*.contract.ts', 'tao-assets.d.ts'],
    })
  }${NewlineCharacter}`
}

type CacheValidationInput = {
  snapshotRoot: string
  fingerprint: string
  nodeModulesDirectory: string
  groups: readonly SidecarGroup[]
  moduleDirectories: readonly string[]
  defaultsPath: string
}

type SnapshotMarker = { fingerprint?: string; nodeModulesDirectory?: string }
type OptionalSnapshotMarker = SnapshotMarker | undefined

function parseSidecarSnapshotMarker(contents: string): unknown {
  return Json.Parse(contents) as unknown
}

function serializeExpectedSidecarSnapshotMarker(fingerprint: string, nodeModulesDirectory: string): string {
  return `${Json.Print({ fingerprint, nodeModulesDirectory })}${NewlineCharacter}`
}

function collectExpectedSnapshotFiles(input: CacheValidationInput): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  input.groups.forEach((group, index) => {
    const modulePath = Path.relative(input.snapshotRoot, input.moduleDirectories[index]!)
    files.set(
      Path.join(modulePath, 'package.json'),
      encodeSnapshotText('{"private":true,"type":"module"}' + NewlineCharacter),
    )
    files.set(
      Path.join(modulePath, 'tsconfig.json'),
      encodeSnapshotText(createTypeScriptConfigContent(input.defaultsPath)),
    )
    files.set(Path.join(modulePath, 'tao-assets.d.ts'), encodeSnapshotText(SidecarAssetDeclarations))
    for (const view of group.views) {
      const contractPath = Path.join(modulePath, `.tao-${AST.GetViewName(view.declaration)}.contract.ts`)
      files.set(
        contractPath,
        encodeSnapshotText(Compile.createForeignViewContractSource({
          name: AST.GetViewName(view.declaration),
          parameters: Compile.projectViewParameterTypes(view.declaration),
          exportRelativePath: view.relativeSidecarPath,
        })),
      )
      files.set(`${contractPath}.tao-managed`, encodeSnapshotText(ForeignViewContractOwnership))
    }
    for (const [source, contents] of group.files) {
      files.set(Path.join(modulePath, Path.relative(group.moduleRoot, source)), contents)
    }
  })
  files.set(
    '.tao-sidecar-snapshot.json',
    encodeSnapshotText(serializeExpectedSidecarSnapshotMarker(input.fingerprint, input.nodeModulesDirectory)),
  )
  return files
}

async function snapshotInventoryMatches(
  input: CacheValidationInput,
  expectedFiles: ReadonlyMap<string, Uint8Array>,
): Promise<boolean> {
  const expectedDirectories = collectExpectedSnapshotDirectories(expectedFiles)
  const actualFiles = new Set<string>()
  const actualDirectories = new Set<string>()
  const actualLinks = new Set<string>()
  const expectedLinks = input.moduleDirectories.map(path =>
    Path.join(Path.relative(input.snapshotRoot, path), 'node_modules')
  )
  const pending = ['']
  // A cache hit reads the captured closure once to detect same-size edits, removals, and extra files.
  while (pending.length > 0) {
    const relativeDirectory = pending.pop()!
    const directory = Path.join(input.snapshotRoot, relativeDirectory)
    if (!FS.lstatSync(directory).isDirectory() || isSymbolicLink(directory)) {
      return false
    }
    if (relativeDirectory) {
      actualDirectories.add(relativeDirectory)
    }
    const inventory: SnapshotInventory = { expectedFiles, expectedLinks, pending, actualFiles, actualLinks }
    if (
      !await inspectSnapshotDirectory(
        input.snapshotRoot,
        directory,
        relativeDirectory,
        inventory,
        input.nodeModulesDirectory,
      )
    ) {
      return false
    }
  }
  return haveSameSet(actualFiles, new Set(expectedFiles.keys()))
    && haveSameSet(actualDirectories, expectedDirectories)
    && haveSameSet(actualLinks, new Set(expectedLinks))
}

type SnapshotInventory = {
  expectedFiles: ReadonlyMap<string, Uint8Array>
  expectedLinks: readonly string[]
  pending: string[]
  actualFiles: Set<string>
  actualLinks: Set<string>
}

async function inspectSnapshotDirectory(
  snapshotRoot: string,
  directory: string,
  relativeDirectory: string,
  inventory: SnapshotInventory,
  nodeModulesDirectory: string,
): Promise<boolean> {
  for (const name of await FS.readdir(directory)) {
    const relativePath = Path.join(relativeDirectory, name)
    const path = Path.join(snapshotRoot, relativePath)
    const metadata = FS.lstatSync(path)
    if (inventory.expectedLinks.includes(relativePath)) {
      if (!metadata.isSymbolicLink() || FS.realpathSync(path) !== nodeModulesDirectory) {
        return false
      }
      inventory.actualLinks.add(relativePath)
    } else if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
      inventory.pending.push(relativePath)
    } else if (metadata.isFile() && !metadata.isSymbolicLink()) {
      inventory.actualFiles.add(relativePath)
      const expected = inventory.expectedFiles.get(relativePath)
      if (!expected || !haveEqualBytes(await FS.readFile(path), expected)) {
        return false
      }
    } else {
      return false
    }
  }
  return true
}

function collectExpectedSnapshotDirectories(expectedFiles: ReadonlyMap<string, Uint8Array>): Set<string> {
  const directories = new Set<string>()
  for (const file of expectedFiles.keys()) {
    let parent = Path.dirname(file)
    while (parent !== '.') {
      directories.add(parent)
      parent = Path.dirname(parent)
    }
  }
  return directories
}

function encodeSnapshotText(value: string): Uint8Array {
  return Text.encodeUtf8(value)
}

function isSymbolicLink(path: string): boolean {
  return Try.WithDefault(false, () => FS.lstatSync(path).isSymbolicLink())
}

function haveEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function haveSameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every(value => right.has(value))
}
