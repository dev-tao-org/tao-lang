import { Json, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { requireSetup } from '../../SetupRequired'
import type { ManagedModulesInput, NormalizedManagedRequirement } from '../ManagedModule/ManagedModuleTypes'
import { type ManagedProfileMetadata, optionalText, validateProfileMetadata, writeReadOnly } from './ManagedNpmState'

type InstallHostValue = string | number
const installPolicyVersion = 1

/** installHostIdentity returns the host and policy identity stored with generated node_modules. */
export function installHostIdentity(input: ManagedModulesInput): Record<string, InstallHostValue> {
  const host = input.hostIdentity ?? Platform.systemInfo()
  return { os: host.os, architecture: host.architecture, installPolicyVersion }
}

/** validateInstalledHost rejects an installed tree created for another host or install policy. */
export function validateInstalledHost(metadata: ManagedProfileMetadata, input: ManagedModulesInput): void {
  if (hostMatches(metadata, input)) {
    return
  }
  const recorded = serializeInstallHost(metadata.installHost ?? 'unknown host')
  const current = serializeInstallHost(installHostIdentity(input))
  requireSetup(
    `Managed npm install tree belongs to ${recorded}, but this host is ${current}. `
      + `Run tao setup to rebuild it from the durable lock.`,
  )
}

/** validateReusableProfile verifies immutable ownership before deleting a stale host install tree. */
export async function validateReusableProfile(
  profile: string,
  metadata: ManagedProfileMetadata,
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

function validateDurableOwnership(metadata: ManagedProfileMetadata, fingerprint: string, lock: string): void {
  if (metadata.fingerprint !== fingerprint || metadata.lockHash !== Platform.hashText(lock)) {
    UserInput.Fail(`Managed npm cache ownership or lock validation failed for ${fingerprint}.`)
  }
}

async function validateProfileLock(profile: string, storedLock: string, repair: boolean): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  const profileLock = await optionalText(lockfile)
  if (profileLock === undefined || profileLock === storedLock) {
    return
  }
  if (!repair) {
    UserInput.Fail(`Managed npm lock copies differ. Repair with: tao setup --repair.`)
  }
  await writeReadOnly(lockfile, storedLock)
}

async function removeOwnedInstallTree(profile: string): Promise<void> {
  const nodeModules = Path.join(profile, 'node_modules')
  if (FS.existsSync(nodeModules) && FS.lstatSync(nodeModules).isSymbolicLink()) {
    UserInput.Fail(`Managed npm install tree cannot be a symbolic link: ${nodeModules}`)
  }
  await FS.rm(nodeModules, { recursive: true, force: true })
}

function hostMatches(metadata: ManagedProfileMetadata, input: ManagedModulesInput): boolean {
  return serializeInstallHost(metadata.installHost) === serializeInstallHost(installHostIdentity(input))
}

function serializeInstallHost(identity: unknown): string | undefined {
  return Json.Print(identity)
}
