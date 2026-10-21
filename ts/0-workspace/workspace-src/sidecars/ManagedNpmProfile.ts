import { Errors } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { requireSetup } from '../SetupRequired'
import {
  allRequirements,
  auditInstalledGraph,
  defaultSingletonPackages,
  nativePackageNames,
  validateGraph,
} from './ManagedModuleGraph'
import {
  ensureTypeScriptDefaults,
  publishModuleResolution,
  typeScriptDefaultsHash,
  validateTypeScriptDefaults,
} from './ManagedModuleMetadata'
import type {
  BunExecutor,
  ManagedModulesInput,
  NormalizedManagedRequirement,
  PreparedManagedModules,
} from './ManagedModuleTypes'
import {
  installHostIdentity,
  validateInstalledHost,
  validateReusableProfile,
} from './ManagedNpmHost'
import {
  managedDurableLockHashPath,
  managedDurableLockPath,
  managedGraphFingerprint,
  managedProfileFingerprint,
  managedProfilePath,
  normalizeManagedRequirements,
} from './ManagedNpmIdentity'
import {
  loadDurableLock,
  readManagedProfileLock,
  readManagedProfileMetadata,
} from './ManagedNpmLock'
import {
  claimManagedProfile,
  ensureOwnedFile,
  managedProfileManifest,
  readOwnedMetadata,
  validateManagedManifest,
  validateManagedProfilePath,
  validateProfileMetadata,
  writeReadOnly,
} from './ManagedNpmState'

/** prepareManagedModules installs and audits the app graph, then publishes module resolution metadata. */
export async function prepareManagedModules(
  input: ManagedModulesInput,
  executor: BunExecutor,
  repair = false,
): Promise<PreparedManagedModules> {
  const normalized = normalizeManagedRequirements(input)
  allRequirements(normalized, input.runtimePins)
  const graphFingerprint = managedGraphFingerprint(input, normalized)
  const fingerprint = managedProfileFingerprint(input, graphFingerprint)
  const profile = managedProfilePath(input, fingerprint)
  await prepareProfile(input, normalized, fingerprint, graphFingerprint, profile, executor, repair)
  for (const module of input.modules) {
    await publishModuleResolution(
      module.directory,
      profile,
      module.requirements,
      input.runtimePins,
      input.directory,
      repair,
    )
  }
  return await readManagedModules(input)
}

/** readManagedModules validates declarations and durable cache references without auditing packages again. */
export async function readManagedModules(input: ManagedModulesInput): Promise<PreparedManagedModules> {
  const normalized = normalizeManagedRequirements(input)
  allRequirements(normalized, input.runtimePins)
  const graphFingerprint = managedGraphFingerprint(input, normalized)
  const fingerprint = managedProfileFingerprint(input, graphFingerprint)
  const profile = managedProfilePath(input, fingerprint)
  const metadata = await readManagedProfileMetadata(profile, normalized)
  await validateProfileMetadata(metadata, input, fingerprint, normalized, graphFingerprint)
  validateInstalledHost(metadata, input)
  const lockfile = Path.join(profile, 'bun.lock')
  const durableLock = managedDurableLockPath(input, graphFingerprint)
  const durableHash = managedDurableLockHashPath(input, graphFingerprint)
  const lock = await readManagedProfileLock(lockfile, durableLock, durableHash, graphFingerprint)
  if (metadata.lockHash !== Platform.hashText(lock)) {
    Errors.ThrowUserInput(`Managed npm lock changed. Repair with: tao setup --repair.`)
  }
  await validateManagedManifest(profile, normalized, input.runtimePins)
  await validateTypeScriptDefaults(input.directory)
  if (
    Object.keys(allRequirements(normalized, input.runtimePins)).length > 0
    && !await FileSystem.exists(Path.join(profile, 'node_modules'))
  ) {
    requireSetup(`Managed npm cache is missing. Setup recreates it from its durable lock.`)
  }
  return {
    graphFingerprint,
    fingerprint,
    packageDirectory: profile,
    lockfile,
    nativePackages: Array.isArray(metadata.nativePackages) ? metadata.nativePackages as string[] : [],
  }
}

async function prepareProfile(
  input: ManagedModulesInput,
  normalized: readonly NormalizedManagedRequirement[],
  fingerprint: string,
  graphFingerprint: string,
  profile: string,
  executor: BunExecutor,
  repair: boolean,
): Promise<void> {
  const durableLock = managedDurableLockPath(input, graphFingerprint)
  const durableHash = managedDurableLockHashPath(input, graphFingerprint)
  validateManagedProfilePath(input.directory, profile)
  await FileSystem.mkdir(profile, { recursive: true })
  await FileSystem.mkdir(Path.dirname(durableLock), { recursive: true })
  const storedLock = await loadDurableLock(input, normalized, graphFingerprint, durableLock, durableHash)
  await claimManagedProfile(
    profile,
    fingerprint,
    repair,
    storedLock,
    managedProfileManifest(normalized, input.runtimePins),
  )
  const metadata = await readOwnedMetadata(profile, fingerprint, repair, storedLock)
  validateExistingState(metadata !== undefined, storedLock, fingerprint)
  let rebuildHostInstall = false
  if (storedLock !== undefined && metadata !== undefined) {
    rebuildHostInstall = await validateReusableProfile(
      profile,
      metadata,
      input,
      normalized,
      fingerprint,
      graphFingerprint,
      storedLock,
      repair,
    )
  }
  await validateBunVersion(input, executor)
  await ensureProfileManifest(profile, normalized, input.runtimePins, repair || storedLock === undefined)
  await installFrozenGraph(profile, storedLock, executor, repair)
  await validateGraph(profile, normalized, input.runtimePins)
  await auditInstalledGraph(profile, input, normalized)
  await persistProfile(
    profile,
    durableLock,
    storedLock,
    input,
    normalized,
    fingerprint,
    graphFingerprint,
    repair || rebuildHostInstall,
  )
}

async function validateBunVersion(input: ManagedModulesInput, executor: BunExecutor): Promise<void> {
  const result = await executor('bun', ['--version'], input.directory)
  if (result.status !== 0 || result.stdout.trim() !== input.bunVersion) {
    Errors.ThrowHostEnvironment(
      `Tao requires Bun ${input.bunVersion} to prepare npm dependencies; found ${
        result.stdout.trim() || 'no version'
      }.`,
    )
  }
}

function validateExistingState(
  hasMetadata: boolean,
  storedLock: string | undefined,
  fingerprint: string,
): void {
  if (!hasMetadata && storedLock === undefined) {
    return
  }
  if (storedLock === undefined) {
    Errors.ThrowUserInput(
      `Managed npm durable lock is missing for ${fingerprint}; restore it and its SHA-256 file from version control or an exact source reference.`,
    )
  }
}

async function ensureProfileManifest(
  profile: string,
  requirements: readonly NormalizedManagedRequirement[],
  runtimePins: Record<string, string>,
  repair: boolean,
): Promise<void> {
  await ensureOwnedFile(Path.join(profile, 'package.json'), managedProfileManifest(requirements, runtimePins), repair)
}

async function installFrozenGraph(
  profile: string,
  storedLock: string | undefined,
  executor: BunExecutor,
  repair: boolean,
): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  if (storedLock !== undefined) {
    await ensureOwnedFile(lockfile, storedLock, repair)
  }
  const args = storedLock === undefined
    ? ['install', '--no-progress', '--exact', '--ignore-scripts']
    : ['install', '--frozen-lockfile', '--no-progress', '--ignore-scripts']
  const result = await executor('bun', args, profile)
  if (result.status !== 0) {
    Errors.ThrowHostEnvironment(
      `Tao npm dependencies could not be prepared. Retry with: tao setup --repair. ${result.stderr || result.stdout}`,
    )
  }
  const resultingLock = await FileSystem.readFile(lockfile, 'utf8')
  if (storedLock !== undefined && resultingLock !== storedLock) {
    Errors.ThrowUserInput(`Frozen Bun install changed the durable npm lock. Repair with: tao setup --repair.`)
  }
}

async function persistProfile(
  profile: string,
  durableLock: string,
  storedLock: string | undefined,
  input: ManagedModulesInput,
  requirements: readonly NormalizedManagedRequirement[],
  fingerprint: string,
  graphFingerprint: string,
  repair: boolean,
): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  const lock = await FileSystem.readFile(lockfile, 'utf8')
  if (storedLock === undefined) {
    await writeReadOnly(durableLock, lock)
    await writeReadOnly(managedDurableLockHashPath(input, graphFingerprint), `${Platform.hashText(lock)}\n`)
  }
  const nativePackages = await nativePackageNames(profile)
  await ensureTypeScriptDefaults(input.directory)
  const metadata = profileMetadata(input, requirements, fingerprint, graphFingerprint, lock, nativePackages)
  await ensureOwnedFile(
    Path.join(profile, '.tao-managed.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    repair || storedLock === undefined,
  )
  await FileSystem.rm(Path.join(profile, '.tao-managed-building'), { force: true })
  await FileSystem.chmod(lockfile, 0o444)
}

function profileMetadata(
  input: ManagedModulesInput,
  requirements: readonly NormalizedManagedRequirement[],
  fingerprint: string,
  graphFingerprint: string,
  lock: string,
  nativePackages: string[],
): Record<string, unknown> {
  return {
    fingerprint,
    graphFingerprint,
    target: input.target,
    bunVersion: input.bunVersion,
    runtimePins: input.runtimePins,
    requirements: allRequirements(requirements),
    singletonPackages: input.singletonPackages ?? defaultSingletonPackages,
    policyRegistryVersion: 1,
    typeScriptDefaultsHash: typeScriptDefaultsHash(),
    lockHash: Platform.hashText(lock),
    installHost: installHostIdentity(input),
    nativePackages,
  }
}
