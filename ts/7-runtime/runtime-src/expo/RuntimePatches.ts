import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** readRuntimePatches validates dependency patch paths and reads their relocatable source bytes. */
export async function readRuntimePatches(directory: string): Promise<RuntimePatches> {
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(directory, 'package.json'), 'utf8')) as {
    patchedDependencies?: Record<string, string>
  }
  const patchedDependencies = manifest.patchedDependencies ?? {}
  const patches: Record<string, string> = {}
  const entries = Object.entries(patchedDependencies).sort((left, right) => left[1].localeCompare(right[1]))
  for (const [, path] of entries) {
    if (!isSupportedPatchPath(path)) {
      Errors.ThrowUserInput(`Unsupported runtime dependency patch path: ${path}`)
    }
    patches[path] = await FileSystem.readFile(Path.join(directory, path), 'utf8')
  }
  return { patchedDependencies, patches }
}

/** RuntimePatches retains exact package identities and their validated patch files. */
export type RuntimePatches = { patchedDependencies: Record<string, string>; patches: Record<string, string> }

function isSupportedPatchPath(path: string): boolean {
  return path.startsWith('patches/') && !path.includes('\\') && !path.split('/').includes('..')
}
