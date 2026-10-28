import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** RuntimePatches carries exact patch identities and their relocatable source files. */
export type RuntimePatches = { patchedDependencies: PatchedDependencyPaths; patches: RuntimePatchContents }

type PatchedDependencyPaths = Record<string, string>

type RuntimePatchContents = Record<string, string>

/** readRuntimePatches validates dependency patch paths and reads their relocatable source bytes. */
export async function readRuntimePatches(directory: string): Promise<RuntimePatches> {
  const manifest = await readRuntimePackageManifest(Path.join(directory, 'package.json')) as RuntimePackageManifest
  const patchedDependencies = manifest.patchedDependencies ?? {}
  const patches: RuntimePatchContents = {}
  const entries = Object.entries(patchedDependencies).sort((left, right) => left[1].localeCompare(right[1]))
  for (const [, path] of entries) {
    if (!isSupportedPatchPath(path)) {
      Errors.ThrowUserInput(`Unsupported runtime dependency patch path: ${path}`)
    }
    patches[path] = await FileSystem.readFile(Path.join(directory, path), 'utf8')
  }
  return { patchedDependencies, patches }
}

type RuntimePackageManifest = { patchedDependencies?: PatchedDependencyPaths }

async function readRuntimePackageManifest(path: string): Promise<unknown> {
  return JSON.parse(await FileSystem.readFile(path, 'utf8'))
}

function isSupportedPatchPath(path: string): boolean {
  return path.startsWith('patches/') && !path.includes('\\') && !path.split('/').includes('..')
}
