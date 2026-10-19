import { Errors } from '@shared'
import { Path, Platform } from '@shared/os'
import { graphContentsMatch, validateGraphContents } from './ManagedModuleGraph'
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
  if (!reference) {
    return undefined
  }
  return await readReferencedLock(input, reference, requirements, graphFingerprint)
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
