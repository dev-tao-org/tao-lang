import * as AST from '@ast-gen/AST'
import { NewlineCharacter, S, Try } from '@shared'
import { Text } from '@shared/os'
import { FileSystem, Path } from '@shared/os'
import { createForeignViewContractSource, ForeignViewContractOwnership } from '../sidecars/ForeignViewContracts'
import type { SidecarGroup } from './Snapshots'

/** assetDeclarations declares the copied asset formats accepted by sidecar TypeScript modules. */
export const assetDeclarations = S`
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

/** cachedSnapshotMatches verifies captured content, inventory, and the managed package links. */
export async function cachedSnapshotMatches(input: CacheValidationInput): Promise<boolean> {
  const markerPath = Path.join(input.snapshotRoot, '.tao-sidecar-snapshot.json')
  if (isSymbolicLink(input.snapshotRoot) || isSymbolicLink(markerPath) || !await FileSystem.exists(markerPath)) {
    return false
  }
  const parsedMarker = Try.WithDefault(
    undefined,
    () => parseSidecarSnapshotMarker(FileSystem.readFileSync(markerPath, 'utf8')),
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
    JSON.stringify(
      {
        extends: FileSystem.realpathSync(defaultsPath),
        compilerOptions: { baseUrl: '.' },
        include: ['**/*.ts', '**/*.tsx', '.tao-*.contract.ts', 'tao-assets.d.ts'],
      },
      null,
      2,
    )
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
  return JSON.parse(contents) as unknown
}

function serializeExpectedSidecarSnapshotMarker(fingerprint: string, nodeModulesDirectory: string): string {
  return `${JSON.stringify({ fingerprint, nodeModulesDirectory }, null, 2)}${NewlineCharacter}`
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
    files.set(Path.join(modulePath, 'tao-assets.d.ts'), encodeSnapshotText(assetDeclarations))
    for (const view of group.views) {
      const contractPath = Path.join(modulePath, `.tao-${AST.GetViewName(view.declaration)}.contract.ts`)
      const parameters = Object.fromEntries(
        view.declaration.parameters.map(parameter => [parameter.name.value, 'string']),
      )
      files.set(
        contractPath,
        encodeSnapshotText(createForeignViewContractSource({
          name: AST.GetViewName(view.declaration),
          parameters,
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
    if (!FileSystem.lstatSync(directory).isDirectory() || isSymbolicLink(directory)) {
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
  for (const name of await FileSystem.readdir(directory)) {
    const relativePath = Path.join(relativeDirectory, name)
    const path = Path.join(snapshotRoot, relativePath)
    const metadata = FileSystem.lstatSync(path)
    if (inventory.expectedLinks.includes(relativePath)) {
      if (!metadata.isSymbolicLink() || FileSystem.realpathSync(path) !== nodeModulesDirectory) {
        return false
      }
      inventory.actualLinks.add(relativePath)
    } else if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
      inventory.pending.push(relativePath)
    } else if (metadata.isFile() && !metadata.isSymbolicLink()) {
      inventory.actualFiles.add(relativePath)
      const expected = inventory.expectedFiles.get(relativePath)
      if (!expected || !haveEqualBytes(await FileSystem.readFile(path), expected)) {
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
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isSymbolicLink())
}

function haveEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function haveSameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every(value => right.has(value))
}
