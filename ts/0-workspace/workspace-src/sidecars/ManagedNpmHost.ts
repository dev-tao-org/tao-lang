import { Errors } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { ManagedModulesInput } from './ManagedModuleTypes'
import { optionalText, validateProfileMetadata, writeReadOnly } from './ManagedNpmState'

const installPolicyVersion = 1

/** installHostIdentity returns the host and policy identity stored with generated node_modules. */
export function installHostIdentity(input: ManagedModulesInput): Record<string, string | number> {
  const host = input.hostIdentity ?? {
    os: Platform.systemInfo().os,
    architecture: Platform.systemInfo().architecture,
  }
  return { os: host.os, architecture: host.architecture, installPolicyVersion }
}

/** validateInstalledHost rejects an installed tree created for another host or install policy. */
export function validateInstalledHost(metadata: Record<string, unknown>, input: ManagedModulesInput): void {
  if (hostMatches(metadata, input)) {
    return
  }
  const recorded = JSON.stringify(metadata.installHost ?? 'unknown host')
  const current = JSON.stringify(installHostIdentity(input))
  Errors.ThrowUserInput(
    `Managed npm install tree belongs to ${recorded}, but this host is ${current}. `
      + `Run tao prepare to rebuild it from the durable lock.`,
  )
}

/** validateReusableProfile verifies immutable ownership before deleting a stale host install tree. */
export async function validateReusableProfile(
  profile: string,
  metadata: Record<string, unknown>,
  input: ManagedModulesInput,
  requirements: [string, string, string][],
  fingerprint: string,
  storedLock: string,
  repair: boolean,
): Promise<boolean> {
  validateDurableOwnership(metadata, fingerprint, storedLock)
  if (!repair) {
    await validateProfileMetadata(metadata, input, fingerprint, requirements)
  }
  await validateProfileLock(profile, storedLock, repair)
  if (hostMatches(metadata, input)) {
    return false
  }
  await removeOwnedInstallTree(profile)
  return true
}

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
    Errors.ThrowUserInput(`Managed npm lock copies differ. Repair with: tao prepare --repair.`)
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
