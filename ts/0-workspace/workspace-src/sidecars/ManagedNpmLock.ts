import { Errors } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { defaultSingletonPackages, graphContentsMatch, validateGraphContents } from './ManagedModuleGraph'
import type { ManagedModulesInput } from './ManagedModuleTypes'
import { optionalJson, optionalText } from './ManagedNpmState'

/** readManagedProfileMetadata requires prepared metadata for the active install profile. */
export async function readManagedProfileMetadata(
  profile: string,
  requirements: [string, string, string][],
): Promise<Record<string, unknown>> {
  const metadata = await optionalJson(Path.join(profile, '.tao-managed.json'))
  if (!metadata) {
    const owner = requirements[0]?.[2].split('\n')[1] ?? 'project runtime'
    Errors.ThrowUserInput(
      `Managed npm declarations changed or are not prepared. Repair with: tao prepare --repair (owning declaration: ${owner})`,
    )
  }
  return metadata
}

/** readManagedProfileLock verifies profile and durable lock copies before use. */
export async function readManagedProfileLock(
  profileLock: string,
  durableLock: string,
  durableHash: string,
  fingerprint: string,
): Promise<string> {
  const profile = await optionalText(profileLock)
  const durable = await optionalText(durableLock)
  const hash = await optionalText(durableHash)
  validateDurableLock(durable, hash, fingerprint)
  if (!profile || !durable) {
    Errors.ThrowUserInput('Managed npm lock is missing. Repair with: tao prepare --repair.')
  }
  if (profile !== durable) {
    Errors.ThrowUserInput('Managed npm lock copies differ. Repair with: tao prepare --repair.')
  }
  return profile
}

/** validateDurableLock rejects incomplete or altered durable lock records. */
export function validateDurableLock(
  lock: string | undefined,
  hash: string | undefined,
  fingerprint: string,
): void {
  if ((lock === undefined) !== (hash === undefined) || lock !== undefined && hash !== `${Platform.hashText(lock)}\n`) {
    Errors.ThrowUserInput(`Managed npm durable lock is changed or incomplete for ${fingerprint}.`)
  }
}

/** recoverManagedLock finds an integrity-verified exact graph for frozen installation. */
export async function recoverManagedLock(
  input: ManagedModulesInput,
  requirements: [string, string, string][],
  graphFingerprint: string,
): Promise<string | undefined> {
  const reference = input.previousGraphReference
  if (reference) {
    const lock = await readReferencedLock(input, reference, requirements, graphFingerprint)
    if (lock !== undefined) {
      return lock
    }
  }
  return await findUniqueLock(input, requirements, graphFingerprint)
}

async function readReferencedLock(
  input: ManagedModulesInput,
  reference: NonNullable<ManagedModulesInput['previousGraphReference']>,
  requirements: [string, string, string][],
  graphFingerprint: string,
): Promise<string | undefined> {
  const path = Path.resolve(input.directory, ...reference.lockPath.split('/'))
  const lock = await optionalText(path)
  if (lock === undefined || Platform.hashText(lock) !== reference.lockHash) {
    Errors.ThrowUserInput('Referenced managed npm graph lock is missing or changed; refusing to resolve a new graph.')
  }
  await validatePresentProfile(input, reference.fingerprint, reference.lockHash, lock)
  if (!graphContentsMatch(lock, requirements, input.runtimePins)) {
    if (reference.fingerprint === graphFingerprint) {
      validateGraphContents(lock, requirements, input.runtimePins)
    }
    return undefined
  }
  return lock
}

async function validatePresentProfile(
  input: ManagedModulesInput,
  fingerprint: string,
  lockHash: string,
  lock: string,
): Promise<void> {
  const profile = Path.join(input.directory, '.tao', 'cache', 'managed-modules', fingerprint)
  const metadata = await optionalJson(Path.join(profile, '.tao-managed.json'))
  if (metadata && (metadata.fingerprint !== fingerprint || metadata.lockHash !== lockHash)) {
    Errors.ThrowUserInput('Referenced managed npm profile does not match its exact source lock reference.')
  }
  const profileLock = await optionalText(Path.join(profile, 'bun.lock'))
  if (profileLock !== undefined && profileLock !== lock) {
    Errors.ThrowUserInput('Referenced managed npm profile lock differs from its exact source lock reference.')
  }
}

async function findUniqueLock(
  input: ManagedModulesInput,
  requirements: [string, string, string][],
  graphFingerprint: string,
): Promise<string | undefined> {
  const directory = Path.join(input.directory, '.tao', 'store', 'npm')
  if (!await FileSystem.exists(directory)) {
    return undefined
  }
  const profilesDirectory = Path.join(input.directory, '.tao', 'cache', 'managed-modules')
  const profiles = await FileSystem.exists(profilesDirectory) ? await FileSystem.readdir(profilesDirectory) : []
  const candidates: string[] = []
  for (const filename of await FileSystem.readdir(directory)) {
    if (!filename.endsWith('.lock')) {
      continue
    }
    const path = Path.join(directory, filename)
    const lock = await optionalText(path)
    const hash = await optionalText(path.replace(/\.lock$/, '.sha256'))
    if (
      !lock || hash !== `${Platform.hashText(lock)}\n` || !graphContentsMatch(lock, requirements, input.runtimePins)
    ) {
      continue
    }
    const identity = filename.slice(0, -'.lock'.length)
    const owners = await matchingProfiles(profilesDirectory, profiles, identity, graphFingerprint)
    if (owners.length === 0) {
      Errors.ThrowUserInput(
        'A compatible managed npm lock exists without verifiable graph metadata; refusing to resolve a new graph.',
      )
    }
    if (owners.some(owner => owner.lockHash === Platform.hashText(lock) && matchesPolicy(owner, input))) {
      candidates.push(lock)
    }
  }
  const unique = [...new Set(candidates)]
  if (unique.length > 1) {
    Errors.ThrowUserInput(
      'Multiple compatible managed npm locks exist; select or repair the exact graph before preparing.',
    )
  }
  return unique[0]
}

async function matchingProfiles(
  directory: string,
  profiles: string[],
  legacyIdentity: string,
  graphFingerprint: string,
): Promise<Record<string, unknown>[]> {
  const matches: Record<string, unknown>[] = []
  for (const profile of profiles) {
    const metadata = await optionalJson(Path.join(directory, profile, '.tao-managed.json'))
    if (metadata?.fingerprint === legacyIdentity || metadata?.graphFingerprint === graphFingerprint) {
      matches.push(metadata)
    }
  }
  return matches
}

function matchesPolicy(metadata: Record<string, unknown>, input: ManagedModulesInput): boolean {
  return metadata.target === input.target && sameStringRecord(metadata.runtimePins, input.runtimePins)
    && metadata.policyRegistryVersion === 1 && Array.isArray(metadata.singletonPackages)
    && [...metadata.singletonPackages].sort().join('\0')
      === [...input.singletonPackages ?? defaultSingletonPackages].sort().join('\0')
}

function sameStringRecord(value: unknown, expected: Record<string, string>): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const entries = Object.entries(value)
  return entries.length === Object.keys(expected).length
    && entries.every(([key, item]) => typeof item === 'string' && expected[key] === item)
}
