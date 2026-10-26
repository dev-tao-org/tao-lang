import { Errors } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import TypeScript from 'typescript'
import type { ManagedModulesInput, ManagedRuntimePolicy } from './ManagedModuleTypes'
import { ensureOwnedFile, optionalText, validateManagedProfilePath } from './ManagedNpmState'

/** compareCodePointStrings sorts domain keys without locale-dependent ordering. */
export function compareCodePointStrings(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

/** describeManagedResolutionPolicy returns stable graph inputs without installation-only patch bytes. */
export function describeManagedResolutionPolicy(
  policy: ManagedRuntimePolicy | undefined,
): Record<string, unknown> | undefined {
  return policy
    ? {
      patchedDependencies: sortRecord(policy.patchedDependencies),
      overrides: sortRecord(policy.overrides),
    }
    : undefined
}

/** calculateManagedPatchIdentity identifies patch bytes separately from the durable dependency graph. */
export function calculateManagedPatchIdentity(policy: ManagedRuntimePolicy | undefined): string | undefined {
  return policy ? Platform.hashText(JSON.stringify(sortRecord(policy.patches))) : undefined
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
    await FileSystem.mkdir(Path.dirname(destination), { recursive: true })
    await ensureOwnedFile(destination, content, repair)
  }
}

/** validateManagedPatches rejects missing or changed patch resources in prepared profiles. */
export async function validateManagedPatches(profile: string, input: ManagedModulesInput): Promise<void> {
  for (const [path, content] of listManagedPatches(input.runtimePolicy)) {
    validateManagedProfilePath(input.directory, Path.join(profile, path))
    if (await optionalText(Path.join(profile, path)) !== content) {
      Errors.ThrowUserInput('Managed npm runtime patch drifted. Repair with: tao setup --repair.')
    }
  }
}

/** managedLockPolicyMatches verifies the lock's resolution policy against the bundled runtime. */
export function managedLockPolicyMatches(source: string, input: ManagedModulesInput): boolean {
  const parsed = TypeScript.parseConfigFileTextToJson('bun.lock', source)
  if (parsed.error || !parsed.config || typeof parsed.config !== 'object') {
    return false
  }
  const lock = parsed.config as Record<string, unknown>
  const policy = input.runtimePolicy
  return recordsMatch(lock.patchedDependencies, policy?.patchedDependencies ?? {})
    && recordsMatch(lock.overrides, policy?.overrides ?? {})
}

/** repairManagedLockPolicy updates policy metadata only when every overridden version is already locked. */
export function repairManagedLockPolicy(source: string, input: ManagedModulesInput): string {
  const parsed = TypeScript.parseConfigFileTextToJson('bun.lock', source)
  const lock = parsed.config as Record<string, unknown>
  const packages = lock.packages as Record<string, unknown>
  for (const [name, version] of Object.entries(input.runtimePolicy?.overrides ?? {})) {
    const identities = Object.values(packages).flatMap(value =>
      Array.isArray(value) && typeof value[0] === 'string' && value[0].startsWith(`${name}@`) ? [value[0]] : []
    )
    if (!identities.length || identities.some(identity => identity !== `${name}@${version}`)) {
      Errors.ThrowUserInput(
        `Runtime patch policy requires ${name}@${version}, but the durable npm graph locks ${
          identities.join(', ') || 'no version'
        }. Frozen repair cannot change package resolutions; explicitly update the owning npm graph before retrying.`,
      )
    }
  }
  const policy = {
    patchedDependencies: undefined,
    overrides: undefined,
    ...describeManagedResolutionPolicy(input.runtimePolicy),
  }
  return `${JSON.stringify({ ...lock, ...policy }, null, 2)}\n`
}

function listManagedPatches(policy: ManagedRuntimePolicy | undefined): [string, string][] {
  const patches: [string, string][] = []
  for (const path of Object.values(policy?.patchedDependencies ?? {}).sort()) {
    if (!isManagedPatchPath(path)) {
      Errors.ThrowUserInput(`Unsupported managed runtime patch path: ${path}`)
    }
    const content = policy?.patches[path]
    if (content === undefined) {
      Errors.ThrowUserInput(`Managed runtime patch resource is missing: ${path}`)
    }
    patches.push([path, content])
  }
  return patches
}

function isManagedPatchPath(path: string): boolean {
  return path.startsWith('patches/') && !path.includes('\\')
    && path.split('/').every(part => part !== '..' && part !== '.' && part.length > 0)
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareCodePointStrings(left, right)))
}

function recordsMatch(value: unknown, expected: Record<string, string>): boolean {
  if (value === undefined) {
    return Object.keys(expected).length === 0
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && JSON.stringify(sortRecord(value as Record<string, string>)) === JSON.stringify(sortRecord(expected))
}
