import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { readRuntimePatches, type RuntimePatches } from './RuntimePatches'

/** RuntimeDependencyLock carries package identities and lockfile records from bun.lock. */
export type RuntimeDependencyLock = { packages: Record<string, [string, ...unknown[]]> }

/** parseRuntimeDependencyLock reads bun.lock JSON without claiming to validate its shape. */
export function parseRuntimeDependencyLock(contents: string): unknown {
  return JSON.parse(contents)
}

type RuntimePackageOverrides = Record<string, string>

/** RuntimeDependencyPolicy carries exact Metro package policy into separately installed app profiles. */
export type RuntimeDependencyPolicy = {
  patchedDependencies: RuntimePatches['patchedDependencies']
  overrides: RuntimePackageOverrides
  patches: RuntimePatches['patches']
}

/** readRuntimeDependencyPolicy reads relocatable patch bytes and their exact package identities. */
export async function readRuntimeDependencyPolicy(directory: string): Promise<RuntimeDependencyPolicy> {
  const { patchedDependencies, patches } = await readRuntimePatches(directory)
  const overrides: RuntimePackageOverrides = {}
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
  const lock = parseRuntimeDependencyLock(
    await FileSystem.readFile(Path.join(directory, 'bun.lock'), 'utf8'),
  ) as RuntimeDependencyLock
  const wrapper = lock.packages['@expo/metro']?.[0]
  if (wrapper) {
    overrides['@expo/metro'] = wrapper.slice('@expo/metro@'.length)
  }
  return { patchedDependencies, overrides, patches }
}
