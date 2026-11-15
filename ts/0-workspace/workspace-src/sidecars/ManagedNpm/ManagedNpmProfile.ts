import * as Runtime from '@runtime'
import { Json } from '@shared'
import { Errors, NewlineCharacter } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { requireSetup } from '../../SetupRequired'
import * as Graph from '../ManagedModule/ManagedModuleGraph'
import * as Metadata from '../ManagedModule/ManagedModuleMetadata'
import type * as Types from '../ManagedModule/ManagedModuleTypes'
import * as Host from './ManagedNpmHost'
import * as Identity from './ManagedNpmIdentity'
import * as Lock from './ManagedNpmLock'
import { ensureManagedPatches, managedLockPolicyMatches, validateManagedPatches } from './ManagedNpmPolicy'
import * as State from './ManagedNpmState'

type StoredNpmLock = string | undefined

/** prepareManagedModules installs and audits the app graph, then publishes module resolution metadata. */
export async function prepareManagedModules(
  input: Types.ManagedModulesInput,
  executor: Types.BunExecutor,
  repair = false,
): Promise<Types.PreparedManagedModules> {
  const normalized = Identity.normalizeManagedRequirements(input)
  Graph.collectAllRequirements(normalized, input.runtimePins)
  const graphFingerprint = Identity.calculateManagedGraphFingerprint(input, normalized)
  const fingerprint = Identity.calculateManagedProfileFingerprint(input, graphFingerprint)
  const profile = Identity.resolveManagedProfilePath(input, fingerprint)
  await prepareProfile(input, normalized, fingerprint, graphFingerprint, profile, executor, repair)
  for (const module of input.modules) {
    await Metadata.publishModuleResolution(
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
export async function readManagedModules(input: Types.ManagedModulesInput): Promise<Types.PreparedManagedModules> {
  const normalized = Identity.normalizeManagedRequirements(input)
  Graph.collectAllRequirements(normalized, input.runtimePins)
  const graphFingerprint = Identity.calculateManagedGraphFingerprint(input, normalized)
  const fingerprint = Identity.calculateManagedProfileFingerprint(input, graphFingerprint)
  const profile = Identity.resolveManagedProfilePath(input, fingerprint)
  const metadata = await Lock.readManagedProfileMetadata(profile, normalized)
  await State.validateProfileMetadata(metadata, input, fingerprint, normalized, graphFingerprint)
  Host.validateInstalledHost(metadata, input)
  const lockfile = Path.join(profile, 'bun.lock')
  const durableLock = Identity.resolveManagedDurableLockPath(input, graphFingerprint)
  const durableHash = Identity.resolveManagedDurableLockHashPath(input, graphFingerprint)
  const lock = await Lock.readManagedProfileLock(lockfile, durableLock, durableHash, graphFingerprint)
  if (metadata.lockHash !== Platform.hashText(lock)) {
    Errors.ThrowUserInput(`Managed npm lock changed. Repair with: tao setup --repair.`)
  }
  validateLockPolicy(lock, input)
  await State.validateManagedManifest(profile, normalized, input.runtimePins, input.runtimePolicy)
  await validateManagedPatches(profile, input)
  await Metadata.validateTypeScriptDefaults(input.directory)
  if (
    Object.keys(Graph.collectAllRequirements(normalized, input.runtimePins)).length > 0
    && !await FS.exists(Path.join(profile, 'node_modules'))
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
  input: Types.ManagedModulesInput,
  normalized: readonly Types.NormalizedManagedRequirement[],
  fingerprint: string,
  graphFingerprint: string,
  profile: string,
  executor: Types.BunExecutor,
  repair: boolean,
): Promise<void> {
  const durableLock = Identity.resolveManagedDurableLockPath(input, graphFingerprint)
  const durableHash = Identity.resolveManagedDurableLockHashPath(input, graphFingerprint)
  State.validateManagedProfilePath(input.directory, profile)
  await FS.mkdirs(profile, Path.dirname(durableLock))
  const storedLock = await Lock.loadDurableLock(input, normalized, graphFingerprint, durableLock, durableHash, repair)
  await State.claimManagedProfile(
    profile,
    fingerprint,
    repair,
    storedLock,
    State.createManagedProfileManifest(normalized, input.runtimePins, input.runtimePolicy),
  )
  const metadata = await State.readOwnedMetadata(profile, fingerprint, repair, storedLock)
  validateExistingState(metadata !== undefined, storedLock, fingerprint)
  let rebuildHostInstall = false
  if (storedLock !== undefined && metadata !== undefined) {
    rebuildHostInstall = await Host.validateReusableProfile(
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
  await ensureProfileManifest(profile, normalized, input, repair || storedLock === undefined)
  await ensureManagedPatches(profile, input, repair)
  await installFrozenGraph(profile, storedLock, executor, repair)
  validateLockPolicy(await FS.readFile(Path.join(profile, 'bun.lock'), 'utf8'), input)
  await Graph.validateGraph(profile, normalized, input.runtimePins)
  await Graph.auditInstalledGraph(profile, input, normalized)
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

async function validateBunVersion(
  input: Types.ManagedModulesInput,
  executor: Types.BunExecutor,
): Promise<void> {
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
  storedLock: StoredNpmLock,
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
  requirements: readonly Types.NormalizedManagedRequirement[],
  input: Types.ManagedModulesInput,
  repair: boolean,
): Promise<void> {
  await State.ensureOwnedFile(
    Path.join(profile, 'package.json'),
    State.createManagedProfileManifest(requirements, input.runtimePins, input.runtimePolicy),
    repair,
  )
}

function validateLockPolicy(lock: string, input: Types.ManagedModulesInput): void {
  if (!managedLockPolicyMatches(lock, input)) {
    Errors.ThrowUserInput('Managed npm lock does not match the runtime patch policy. Repair with: tao setup --repair.')
  }
}

async function installFrozenGraph(
  profile: string,
  storedLock: StoredNpmLock,
  executor: Types.BunExecutor,
  repair: boolean,
): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  if (storedLock !== undefined) {
    await State.ensureOwnedFile(lockfile, storedLock, repair)
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
  const resultingLock = await FS.readFile(lockfile, 'utf8')
  if (storedLock !== undefined && resultingLock !== storedLock) {
    Errors.ThrowUserInput(`Frozen Bun install changed the durable npm lock. Repair with: tao setup --repair.`)
  }
}

async function persistProfile(
  profile: string,
  durableLock: string,
  storedLock: StoredNpmLock,
  input: Types.ManagedModulesInput,
  requirements: readonly Types.NormalizedManagedRequirement[],
  fingerprint: string,
  graphFingerprint: string,
  repair: boolean,
): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  const lock = await FS.readFile(lockfile, 'utf8')
  if (storedLock === undefined || !await FS.exists(durableLock)) {
    await State.writeReadOnly(durableLock, lock)
    await State.writeReadOnly(
      Identity.resolveManagedDurableLockHashPath(input, graphFingerprint),
      `${Platform.hashText(lock)}${NewlineCharacter}`,
    )
  }
  const nativePackages = await Graph.listNativePackageNames(profile)
  await Metadata.ensureTypeScriptDefaults(input.directory)
  const metadata = createProfileMetadata(input, requirements, fingerprint, graphFingerprint, lock, nativePackages)
  await State.ensureOwnedFile(
    Path.join(profile, '.tao-managed.json'),
    serializeProfileMetadata(metadata),
    repair || storedLock === undefined,
  )
  await FS.rm(Path.join(profile, '.tao-managed-building'), { force: true })
  await FS.chmod(lockfile, 0o444)
}

function serializeProfileMetadata(metadata: State.ManagedProfileMetadata): string {
  return `${Json.Print(metadata)}${NewlineCharacter}`
}

function createProfileMetadata(
  input: Types.ManagedModulesInput,
  requirements: readonly Types.NormalizedManagedRequirement[],
  fingerprint: string,
  graphFingerprint: string,
  lock: string,
  nativePackages: string[],
): State.ManagedProfileMetadata {
  return {
    fingerprint,
    graphFingerprint,
    target: input.target,
    bunVersion: input.bunVersion,
    runtimePins: input.runtimePins,
    requirements: Graph.collectAllRequirements(requirements),
    singletonPackages: Runtime.resolveRuntimeSingletonPackages(input.singletonPackages),
    policyRegistryVersion: 1,
    typeScriptDefaultsHash: Metadata.typeScriptDefaultsHash(),
    lockHash: Platform.hashText(lock),
    installHost: Host.installHostIdentity(input),
    nativePackages,
  }
}
