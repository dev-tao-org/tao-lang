import { Errors } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { requireSetup } from '../SetupRequired'
import type { ManagedModulesInput, NormalizedManagedRequirement } from './ManagedModuleTypes'
import { optionalText, validateProfileMetadata, writeReadOnly } from './ManagedNpmState'

/** installHostIdentity returns the host and policy identity stored with generated node_modules. */
export function installHostIdentity(input: ManagedModulesInput): Record<string, InstallHostValue> {
  const host = input.hostIdentity ?? Platform.systemInfo()
  return { os: host.os, architecture: host.architecture, installPolicyVersion }
}

/** validateInstalledHost rejects an installed tree created for another host or install policy. */
export function validateInstalledHost(metadata: Record<string, unknown>, input: ManagedModulesInput): void {
  if (hostMatches(metadata, input)) {
    return
  }
  const recorded = JSON.stringify(metadata.installHost ?? 'unknown host')
  const current = JSON.stringify(installHostIdentity(input))
  requireSetup(
    `Managed npm install tree belongs to ${recorded}, but this host is ${current}. `
      + `Run tao setup to rebuild it from the durable lock.`,
  )
}

/** validateReusableProfile verifies immutable ownership before deleting a stale host install tree. */
export async function validateReusableProfile(
  profile: string,
  metadata: Record<string, unknown>,
  input: ManagedModulesInput,
  requirements: readonly NormalizedManagedRequirement[],
  fingerprint: string,
  graphFingerprint: string,
  storedLock: string,
  repair: boolean,
): Promise<boolean> {
  validateDurableOwnership(metadata, fingerprint, storedLock)
  if (!repair) {
    await validateProfileMetadata(metadata, input, fingerprint, requirements, graphFingerprint)
  }
  await validateProfileLock(profile, storedLock, repair)
  if (hostMatches(metadata, input)) {
    return false
  }
  await removeOwnedInstallTree(profile)
  return true
}

type InstallHostValue = string | number

function validateDurableOwnership(metadata: Record<string, unknown>, fingerprint: string, lock: string): void {
  if (metadata.fingerprint !== fingerprint || metadata.lockHash !== Platform.hashText(lock)) {
    Errors.ThrowUserInput(`Managed npm cache ownership or lock validation failed for ${fingerprint}.`)
  }
}

async function validateProfileLock(profile: string, storedLock: string, repair: boolean): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  const profileLock = await optionalText(lockfile)
  if (profileLock === undefined || profileLock === storedLock) {
    return
  }
  if (!repair) {
    Errors.ThrowUserInput(`Managed npm lock copies differ. Repair with: tao setup --repair.`)
  }
  await writeReadOnly(lockfile, storedLock)
}

async function removeOwnedInstallTree(profile: string): Promise<void> {
  const nodeModules = Path.join(profile, 'node_modules')
  if (FileSystem.existsSync(nodeModules) && FileSystem.lstatSync(nodeModules).isSymbolicLink()) {
    Errors.ThrowUserInput(`Managed npm install tree cannot be a symbolic link: ${nodeModules}`)
  }
  await FileSystem.rm(nodeModules, { recursive: true, force: true })
}

function hostMatches(metadata: Record<string, unknown>, input: ManagedModulesInput): boolean {
  return JSON.stringify(metadata.installHost) === JSON.stringify(installHostIdentity(input))
}

const installPolicyVersion = 1
