import { NewlineCharacter, UserInput } from '@shared'
import { Path, Platform } from '@shared/os'
import type { ManagedGraphReference } from '../../dependencies/Types'
import { requireSetup } from '../../SetupRequired'
import { graphContentsMatch, validateGraphContents } from '../ManagedModule/ManagedModuleGraph'
import type { ManagedModulesInput, NormalizedManagedRequirement } from '../ManagedModule/ManagedModuleTypes'
import { managedLockPolicyMatches, repairManagedLockPolicy } from './ManagedNpmPolicy'
import { type ManagedProfileMetadata, optionalJson, optionalText } from './ManagedNpmState'

type ManagedLockContents = string | undefined

/** readManagedProfileMetadata requires prepared metadata for the active install profile. */
export async function readManagedProfileMetadata(
  profile: string,
  requirements: readonly NormalizedManagedRequirement[],
): Promise<ManagedProfileMetadata> {
  const metadata = await optionalJson(Path.join(profile, '.tao-managed.json'))
  if (!metadata) {
    const owner = requirements[0]?.origin ?? 'project runtime'
    requireSetup(
      `Managed npm declarations changed or are not prepared. Repair with: tao setup --repair (owning declaration: ${owner})`,
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
  if (!profile && durable) {
    requireSetup('The installed npm lock is missing; setup restores it from the exact durable lock.')
  }
  UserInput.require(
    !(!profile || !durable),
    'Managed npm lock is missing; restore it and its SHA-256 file from version control, then retry preparation.',
  )
  UserInput.require(profile === durable, 'Managed npm lock copies differ. Repair with: tao setup --repair.')
  return profile
}

/** loadDurableLock reads canonical graph bytes or restores the exact verified source lock. */
export async function loadDurableLock(
  input: ManagedModulesInput,
  requirements: readonly NormalizedManagedRequirement[],
  graphFingerprint: string,
  durableLock: string,
  durableHash: string,
  repair = false,
): Promise<string | undefined> {
  let lock = await optionalText(durableLock)
  let hash = await optionalText(durableHash)
  if (lock === undefined) {
    lock = await recoverManagedLock(input, requirements, graphFingerprint, repair)
    if (lock !== undefined) {
      hash = `${Platform.hashText(lock)}${NewlineCharacter}`
    }
  }
  validateDurableLock(lock, hash, graphFingerprint)
  return lock
}

function validateDurableLock(
  lock: ManagedLockContents,
  hash: ManagedLockContents,
  fingerprint: string,
): void {
  if (
    (lock === undefined) !== (hash === undefined)
    || lock !== undefined && hash !== `${Platform.hashText(lock)}${NewlineCharacter}`
  ) {
    UserInput.fail(
      `Managed npm durable lock is changed or incomplete for ${fingerprint}; restore it and its SHA-256 file from version control.`,
    )
  }
}

async function recoverManagedLock(
  input: ManagedModulesInput,
  requirements: readonly NormalizedManagedRequirement[],
  graphFingerprint: string,
  repair: boolean,
): Promise<string | undefined> {
  const reference = input.previousGraphReference
  if (!reference) {
    return undefined
  }
  return await readReferencedLock(input, reference, requirements, graphFingerprint, repair)
}

async function readReferencedLock(
  input: ManagedModulesInput,
  reference: ManagedGraphReference,
  requirements: readonly NormalizedManagedRequirement[],
  graphFingerprint: string,
  repair: boolean,
): Promise<string | undefined> {
  const path = Path.resolve(input.directory, ...reference.lockPath.split('/'))
  const lock = await optionalText(path)
  UserInput.require(
    !(lock === undefined || Platform.hashText(lock) !== reference.lockHash),
    'Referenced managed npm graph lock is missing or changed; restore the source lock and .tao/store lock files from version control.',
  )
  await validatePresentProfile(input, reference.fingerprint, reference.lockHash, lock)
  if (!graphContentsMatch(lock, requirements, input.runtimePins)) {
    if (reference.fingerprint === graphFingerprint) {
      validateGraphContents(lock, requirements, input.runtimePins)
    }
    return undefined
  }
  if (!managedLockPolicyMatches(lock, input)) {
    UserInput.require(
      !(!repair || reference.fingerprint === graphFingerprint),
      'Managed npm runtime patch policy changed. Preserve locked package versions with: tao setup --repair.',
    )
    return repairManagedLockPolicy(lock, input)
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
  UserInput.require(
    !(metadata && (metadata.fingerprint !== fingerprint || metadata.lockHash !== lockHash)),
    'Referenced managed npm profile does not match its exact source lock reference.',
  )
  const profileLock = await optionalText(Path.join(profile, 'bun.lock'))
  UserInput.require(
    !(profileLock !== undefined && profileLock !== lock),
    'Referenced managed npm profile lock differs from its exact source lock reference.',
  )
}
