import { Json, Lists, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { readRuntimePatches, type RuntimePatches } from './RuntimePatches'

/** RuntimeDependencyLock carries package identities and lockfile records from bun.lock. */
export type RuntimeDependencyLock = Record<string, unknown> & { packages: Record<string, [string, ...unknown[]]> }

/** parseRuntimeDependencyLock validates package identities in a bun.lock JSON document. */
export function parseRuntimeDependencyLock(contents: string, path: string): RuntimeDependencyLock {
  const parsed: unknown = Json.Parse(contents)
  if (!isRuntimeDependencyLock(parsed)) {
    UserInput.Fail(`Runtime dependency lock ${path} must contain package records with string identities.`)
  }
  return parsed
}

type RuntimePackageOverrides = Record<string, string>

const DefaultRuntimeSingletonPackages = ['react', 'react-dom', 'react-native', 'react-native-web', 'expo']

/** RuntimeDependencyPolicy carries exact Expo package policy into separately installed app profiles. */
export type RuntimeDependencyPolicy = {
  patchedDependencies: RuntimePatches['patchedDependencies']
  overrides: RuntimePackageOverrides
  patches: RuntimePatches['patches']
}

/** resolveRuntimeSingletonPackages returns framework, declared, and native packages requiring one canonical path. */
export function resolveRuntimeSingletonPackages(
  declaredSingletons: readonly string[] = [],
  nativePackages: readonly string[] = [],
): string[] {
  return Lists.unique(DefaultRuntimeSingletonPackages, declaredSingletons, nativePackages)
}

/** readRuntimeDependencyPolicy reads relocatable patch bytes and their exact package identities. */
export async function readRuntimeDependencyPolicy(directory: string): Promise<RuntimeDependencyPolicy> {
  const { patchedDependencies, patches } = await readRuntimePatches(directory)
  const overrides: RuntimePackageOverrides = {}
  for (const identity of Object.keys(patchedDependencies)) {
    const versionAt = identity.lastIndexOf('@')
    if (versionAt <= 0) {
      UserInput.Fail(`Runtime dependency patch must identify an exact package: ${identity}`)
    }
    const name = identity.slice(0, versionAt)
    if (name !== 'metro') {
      overrides[name] = identity.slice(versionAt + 1)
    }
  }
  const lock = parseRuntimeDependencyLock(
    await FS.readFile(Path.join(directory, 'bun.lock'), 'utf8'),
    Path.join(directory, 'bun.lock'),
  )
  for (const packageName of ExpoLockOverridePackages) {
    const version = readLockedPackageVersion(lock, packageName)
    if (version !== undefined) {
      overrides[packageName] = version
    }
  }
  return { patchedDependencies, overrides, patches }
}

const ExpoLockOverridePackages = ['@expo/metro', '@expo/router-server'] as const

function readLockedPackageVersion(lock: RuntimeDependencyLock, packageName: string): string | undefined {
  const packageIdentity = lock.packages[packageName]?.[0]
  if (packageIdentity === undefined) {
    return undefined
  }
  const identityPrefix = `${packageName}@`
  if (!packageIdentity.startsWith(identityPrefix)) {
    UserInput.Fail(`Runtime dependency lock entry for ${packageName} has an invalid identity.`)
  }
  return packageIdentity.slice(identityPrefix.length)
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
