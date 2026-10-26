import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { readRuntimePatches } from './RuntimePatches'

/** RuntimeDependencyPolicy carries exact Metro package policy into separately installed app profiles. */
export type RuntimeDependencyPolicy = {
  patchedDependencies: Record<string, string>
  overrides: Record<string, string>
  patches: Record<string, string>
}

/** readRuntimeDependencyPolicy reads relocatable patch bytes and their exact package identities. */
export async function readRuntimeDependencyPolicy(directory: string): Promise<RuntimeDependencyPolicy> {
  const { patchedDependencies, patches } = await readRuntimePatches(directory)
  const overrides: Record<string, string> = {}
  for (const identity of Object.keys(patchedDependencies)) {
    const versionAt = identity.lastIndexOf('@')
    if (versionAt <= 0) {
      Errors.ThrowUserInput(`Runtime dependency patch must identify an exact package: ${identity}`)
    }
    const name = identity.slice(0, versionAt)
    if (name !== 'metro') {
      overrides[name] = identity.slice(versionAt + 1)
    }
  }
  const lock = JSON.parse(await FileSystem.readFile(Path.join(directory, 'bun.lock'), 'utf8')) as {
    packages: Record<string, [string, ...unknown[]]>
  }
  const wrapper = lock.packages['@expo/metro']?.[0]
  if (wrapper) {
    overrides['@expo/metro'] = wrapper.slice('@expo/metro@'.length)
  }
  return { patchedDependencies, overrides, patches }
}
