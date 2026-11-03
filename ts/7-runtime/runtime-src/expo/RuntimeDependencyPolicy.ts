import { Errors, Json } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { readRuntimePatches, type RuntimePatches } from './RuntimePatches'

/** RuntimeDependencyLock carries package identities and lockfile records from bun.lock. */
export type RuntimeDependencyLock = Record<string, unknown> & { packages: Record<string, [string, ...unknown[]]> }

/** parseRuntimeDependencyLock validates package identities in a bun.lock JSON document. */
export function parseRuntimeDependencyLock(contents: string, path: string): RuntimeDependencyLock {
  const parsed: unknown = Json.Parse(contents)
  if (!isRuntimeDependencyLock(parsed)) {
    Errors.ThrowUserInput(`Runtime dependency lock ${path} must contain package records with string identities.`)
  }
  return parsed
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
    Path.join(directory, 'bun.lock'),
  )
  const wrapper = lock.packages['@expo/metro']?.[0]
  if (wrapper) {
    overrides['@expo/metro'] = wrapper.slice('@expo/metro@'.length)
  }
  return { patchedDependencies, overrides, patches }
}

function isRuntimeDependencyLock(value: unknown): value is RuntimeDependencyLock {
  return isObjectRecord(value) && isRuntimePackageRecord(value.packages)
}

function isRuntimePackageRecord(value: unknown): value is Record<string, [string, ...unknown[]]> {
  return isObjectRecord(value) && Object.values(value).every(isRuntimePackageTuple)
}

function isRuntimePackageTuple(value: unknown): value is [string, ...unknown[]] {
  return Array.isArray(value) && typeof value[0] === 'string'
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
