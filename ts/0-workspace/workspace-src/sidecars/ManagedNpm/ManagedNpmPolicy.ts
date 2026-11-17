import { Json, Sort, UserInput } from '@shared'
import { NewlineCharacter } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import type { ManagedModulesInput, ManagedRuntimePolicy } from '../ManagedModule/ManagedModuleTypes'
import * as PackageMetadata from '../ManagedModule/ManagedPackageMetadata'
import { ensureOwnedFile, optionalText, validateManagedProfilePath } from './ManagedNpmState'

type RuntimePolicyInput = ManagedRuntimePolicy | undefined
type ManagedRuntimePolicyMap =
  | ManagedRuntimePolicy['patchedDependencies']
  | ManagedRuntimePolicy['overrides']
  | ManagedRuntimePolicy['patches']

/** describeManagedResolutionPolicy returns stable graph inputs without installation-only patch bytes. */
export function describeManagedResolutionPolicy(
  policy: RuntimePolicyInput,
): PackageMetadata.ManagedMetadataFields | undefined {
  return policy
    ? {
      patchedDependencies: sortRecord(policy.patchedDependencies),
      overrides: sortRecord(policy.overrides),
    }
    : undefined
}

/** calculateManagedPatchIdentity identifies patch bytes separately from the durable dependency graph. */
export function calculateManagedPatchIdentity(policy: RuntimePolicyInput): string | undefined {
  return policy ? Platform.hashText(serializeSortedManagedPolicyRecord(policy.patches)) : undefined
}

/** ensureManagedPatches materializes immutable runtime patches before invoking the package installer. */
export async function ensureManagedPatches(
  profile: string,
  input: ManagedModulesInput,
  repair: boolean,
): Promise<void> {
  for (const [path, content] of listManagedPatches(input.runtimePolicy)) {
    const destination = Path.join(profile, path)
    validateManagedProfilePath(input.directory, destination)
    await FS.mkdir(Path.dirname(destination))
    await ensureOwnedFile(destination, content, repair)
  }
}

/** validateManagedPatches rejects missing or changed patch resources in prepared profiles. */
export async function validateManagedPatches(profile: string, input: ManagedModulesInput): Promise<void> {
  for (const [path, content] of listManagedPatches(input.runtimePolicy)) {
    validateManagedProfilePath(input.directory, Path.join(profile, path))
    UserInput.require(
      await optionalText(Path.join(profile, path)) === content,
      'Managed npm runtime patch drifted. Repair with: tao setup --repair.',
    )
  }
}

/** managedLockPolicyMatches verifies the lock's resolution policy against the bundled runtime. */
export function managedLockPolicyMatches(source: string, input: ManagedModulesInput): boolean {
  const parsed = TypeScript.parseConfigFileTextToJson('bun.lock', source)
  if (parsed.error || !PackageMetadata.isMetadataObject(parsed.config)) {
    return false
  }
  const lock = parsed.config
  const policy = input.runtimePolicy
  return recordsMatch(lock.patchedDependencies, policy?.patchedDependencies ?? {})
    && recordsMatch(lock.overrides, policy?.overrides ?? {})
}

/** repairManagedLockPolicy updates policy metadata only when every overridden version is already locked. */
export function repairManagedLockPolicy(source: string, input: ManagedModulesInput): string {
  const parsed = TypeScript.parseConfigFileTextToJson('bun.lock', source)
  const lock = parsed.config as PackageMetadata.ManagedMetadataFields
  const packages = lock.packages as PackageMetadata.ManagedMetadataFields
  for (const [name, version] of Object.entries(input.runtimePolicy?.overrides ?? {})) {
    const identities = listLockedPackageIdentities(packages, name)
    if (!identities.length || identities.some(identity => identity !== `${name}@${version}`)) {
      UserInput.fail(
        `Runtime patch policy requires ${name}@${version}, but the durable npm graph locks ${
          identities.join(', ') || 'no version'
        }. Frozen repair cannot change package resolutions; explicitly update the owning npm graph before retrying.`,
      )
    }
  }
  const repairedLock = applyManagedLockPolicy(lock, input.runtimePolicy)
  return `${Json.Print(repairedLock)}${NewlineCharacter}`
}

function applyManagedLockPolicy(
  lock: PackageMetadata.ManagedMetadataFields,
  runtimePolicy: RuntimePolicyInput,
): PackageMetadata.ManagedMetadataFields {
  const policy = describeManagedResolutionPolicy(runtimePolicy)
  return { ...lock, patchedDependencies: undefined, overrides: undefined, ...policy }
}

function listManagedPatches(policy: RuntimePolicyInput): [string, string][] {
  const patches: [string, string][] = []
  for (const path of Sort.Strings(Object.values(policy?.patchedDependencies ?? {}))) {
    if (!isManagedPatchPath(path)) {
      UserInput.fail(`Unsupported managed runtime patch path: ${path}`)
    }
    const content = policy?.patches[path]
    if (content === undefined) {
      UserInput.fail(`Managed runtime patch resource is missing: ${path}`)
    }
    patches.push([path, content])
  }
  return patches
}

function listLockedPackageIdentities(packages: PackageMetadata.ManagedMetadataFields, name: string): string[] {
  const entries = Object.values(packages)
  const identities = entries.map(PackageMetadata.readLockedPackageIdentity)
  return identities.filter((identity): identity is string => identity !== undefined && identity.startsWith(`${name}@`))
}

function isManagedPatchPath(path: string): boolean {
  return hasManagedPatchPrefix(path) && hasSafePatchPathSegments(path)
}

function hasManagedPatchPrefix(path: string): boolean {
  return path.startsWith('patches/') && !path.includes('\\')
}

function hasSafePatchPathSegments(path: string): boolean {
  return path.split('/').every(isSafePatchPathSegment)
}

function isSafePatchPathSegment(part: string): boolean {
  return part !== '..' && part !== '.' && part.length > 0
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(Sort.By(([key]) => key, Sort.CompareStrings)))
}

function recordsMatch(value: unknown, expected: ManagedRuntimePolicyMap): boolean {
  if (value === undefined) {
    return Object.keys(expected).length === 0
  }
  return isRecordValue(value)
    && serializeSortedManagedPolicyRecord(value) === serializeSortedManagedPolicyRecord(expected)
}

function serializeSortedManagedPolicyRecord(record: ManagedRuntimePolicyMap): string {
  return Json.Print(sortRecord(record))
}

function isRecordValue(value: unknown): value is ManagedRuntimePolicyMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
