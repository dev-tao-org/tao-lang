import { Json } from '@shared'
import { Errors, Try } from '@shared'
import { FS } from '@shared/os'
import type { ManagedPackageVersionMap } from './ManagedModuleTypes'

/** ManagedMetadataFields maps external package or lock metadata field names to unvalidated values. */
export type ManagedMetadataFields = Record<string, unknown>

/** InstalledPackageMetadata carries the validated installed package identity fields. */
export type InstalledPackageMetadata = ManagedMetadataFields & { name: string; version: string }

/** isMetadataObject narrows non-null metadata objects, including arrays accepted by existing readers. */
export function isMetadataObject(value: unknown): value is ManagedMetadataFields {
  return value !== null && typeof value === 'object'
}

/** isLockMetadata narrows a lock root while excluding arrays. */
export function isLockMetadata(value: unknown): value is ManagedMetadataFields {
  return isMetadataObject(value) && !Array.isArray(value)
}

/** hasPackageIdentity checks the installed manifest's name and version before graph traversal. */
export function hasPackageIdentity(metadata: ManagedMetadataFields): metadata is InstalledPackageMetadata {
  return typeof metadata.name === 'string' && typeof metadata.version === 'string'
}

/** readLockedPackageIdentity reads the leading identity string from a Bun package entry. */
export function readLockedPackageIdentity(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined
}

/** readStringEntries reads string-valued entries from unknown package metadata. */
export function readStringEntries(value: unknown): ManagedPackageVersionMap {
  if (!isMetadataObject(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/** readOptionalPeerNames reads peer dependencies whose metadata marks them optional. */
export function readOptionalPeerNames(value: unknown): Set<string> {
  if (!isMetadataObject(value)) {
    return new Set()
  }
  return new Set(Object.entries(value).filter(([, metadata]) => isOptionalPeerMetadata(metadata)).map(([name]) => name))
}

/** readPackageMetadata reads a package manifest or reports managed npm state failure. */
export async function readPackageMetadata(path: string): Promise<ManagedMetadataFields> {
  return await Try(async () => Json.Parse(await FS.readFile(path, 'utf8')) as ManagedMetadataFields, {
    catch: () =>
      Errors.ThrowUserInput(`Managed npm state is missing or invalid at ${path}; repair with: tao setup --repair.`),
  })
}

/** hasPackageDependencies identifies metadata carrying a dependency field without validating its contents. */
export function hasPackageDependencies(value: unknown): value is ManagedMetadataFields {
  return isMetadataObject(value) && 'dependencies' in value
}

/** isOptionalDependency checks optional dependency membership, including inherited declarations. */
export function isOptionalDependency(name: string, optionalDependencies: ManagedPackageVersionMap): boolean {
  return name in optionalDependencies
}

function isOptionalPeerMetadata(value: unknown): boolean {
  if (!isMetadataObject(value)) {
    return false
  }
  return 'optional' in value && value.optional === true
}
