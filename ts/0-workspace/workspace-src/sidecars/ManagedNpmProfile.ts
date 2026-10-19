import { Errors } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
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
  validateManagedManifest,
  validateTypeScriptDefaults,
} from './ManagedModuleMetadata'
import type {
  BunExecutor,
  ManagedModulesInput,
  PreparedManagedModules,
} from './ManagedModuleTypes'
import {
  installHostIdentity,
  validateInstalledHost,
  validateReusableProfile,
} from './ManagedNpmHost'
import {
  readManagedProfileLock,
  readManagedProfileMetadata,
  recoverManagedLock,
  validateDurableLock,
} from './ManagedNpmLock'
import {
  ensureOwnedFile,
  optionalJson,
  optionalText,
  readOwnedMetadata,
  validateProfileMetadata,
  writeReadOnly,
} from './ManagedNpmState'

/** prepareManagedModules installs and audits the app graph, then publishes module resolution metadata. */
export async function prepareManagedModules(
  input: ManagedModulesInput,
  executor: BunExecutor,
  repair = false,
): Promise<PreparedManagedModules> {
  const normalized = normalize(input)
  allRequirements(normalized, input.runtimePins)
  const graphFingerprint = graphFingerprintFor(input, normalized)
  const fingerprint = fingerprintFor(input, graphFingerprint)
  const profile = profilePath(input, fingerprint)
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
  const normalized = normalize(input)
  allRequirements(normalized, input.runtimePins)
  const graphFingerprint = graphFingerprintFor(input, normalized)
  const fingerprint = fingerprintFor(input, graphFingerprint)
  const profile = profilePath(input, fingerprint)
  const metadata = await readManagedProfileMetadata(profile, normalized)
  await validateProfileMetadata(metadata, input, fingerprint, normalized, graphFingerprint)
  validateInstalledHost(metadata, input)
  const lockfile = Path.join(profile, 'bun.lock')
  const durableLock = durableLockPath(input, graphFingerprint)
  const durableHash = durableLockHashPath(input, graphFingerprint)
  const lock = await readManagedProfileLock(lockfile, durableLock, durableHash, graphFingerprint)
  if (metadata.lockHash !== Platform.hashText(lock)) {
    Errors.ThrowUserInput(`Managed npm lock changed. Repair with: tao prepare --repair.`)
  }
  await validateManagedManifest(profile, normalized, input.runtimePins)
  await validateTypeScriptDefaults(input.directory)
  if (
    Object.keys(allRequirements(normalized, input.runtimePins)).length > 0
    && !await FileSystem.exists(Path.join(profile, 'node_modules'))
  ) {
    Errors.ThrowUserInput(`Managed npm cache is missing. Recreate it from its durable lock with: tao prepare --repair.`)
  }
  return {
    graphFingerprint,
    fingerprint,
    packageDirectory: profile,
    lockfile,
    nativePackages: Array.isArray(metadata.nativePackages) ? metadata.nativePackages as string[] : [],
  }
}

function normalize(input: ManagedModulesInput): [string, string, string][] {
  return input.modules.flatMap(module =>
    module.requirements.map(item =>
      [module.directory, item.name, `${item.version}\n${item.origin}`] as [string, string, string]
    )
  ).sort((left, right) => left.join('\0').localeCompare(right.join('\0')))
}

function graphFingerprintFor(input: ManagedModulesInput, normalized: [string, string, string][]): string {
  const requirements = allRequirements(normalized, input.runtimePins)
  return Platform.hashText(JSON.stringify({
    requirements: Object.fromEntries(
      Object.entries(requirements).sort(([left], [right]) => left.localeCompare(right)),
    ),
    target: input.target,
    runtimePins: Object.fromEntries(
      Object.entries(input.runtimePins).sort(([left], [right]) => left.localeCompare(right)),
    ),
    singletonPackages: [...input.singletonPackages ?? defaultSingletonPackages].sort(),
    policyRegistryVersion: 1,
  }))
}

function fingerprintFor(input: ManagedModulesInput, graphFingerprint: string): string {
  return Platform.hashText(JSON.stringify({
    graphFingerprint,
    bunVersion: input.bunVersion,
    installHost: installHostIdentity(input),
    typeScriptDefaultsHash: typeScriptDefaultsHash(),
  }))
}

function profilePath(input: ManagedModulesInput, fingerprint: string): string {
  return Path.join(input.directory, '.tao', 'cache', 'managed-modules', fingerprint)
}

function durableLockPath(input: ManagedModulesInput, graphFingerprint: string): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${graphFingerprint}.lock`)
}

function durableLockHashPath(input: ManagedModulesInput, graphFingerprint: string): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${graphFingerprint}.sha256`)
}

async function prepareProfile(
  input: ManagedModulesInput,
  normalized: [string, string, string][],
  fingerprint: string,
  graphFingerprint: string,
  profile: string,
  executor: BunExecutor,
  repair: boolean,
): Promise<void> {
  const durableLock = durableLockPath(input, graphFingerprint)
  await FileSystem.mkdir(profile, { recursive: true })
  await FileSystem.mkdir(Path.dirname(durableLock), { recursive: true })
  await claimProfile(profile, fingerprint)
  let storedLock = await optionalText(durableLock)
  let storedHash = await optionalText(durableLockHashPath(input, graphFingerprint))
  if (storedLock === undefined) {
    storedLock = await recoverManagedLock(input, normalized, graphFingerprint)
    if (storedLock !== undefined) {
      await writeReadOnly(durableLock, storedLock)
      storedHash = `${Platform.hashText(storedLock)}\n`
      await writeReadOnly(durableLockHashPath(input, graphFingerprint), storedHash)
    }
  }
  validateDurableLock(storedLock, storedHash, graphFingerprint)
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
    repair || rebuildHostInstall || hasLegacyRequirementList(metadata),
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

async function claimProfile(profile: string, fingerprint: string): Promise<void> {
  const metadataPath = Path.join(profile, '.tao-managed.json')
  if (await FileSystem.exists(metadataPath)) {
    const metadata = await optionalJson(metadataPath)
    if (metadata?.fingerprint !== fingerprint || typeof metadata.lockHash !== 'string') {
      Errors.ThrowUserInput(`Managed npm cache path is already owned: ${profile}`)
    }
    return
  }
  const marker = Path.join(profile, '.tao-managed-building')
  const owner = `${fingerprint}\n`
  const current = await optionalText(marker)
  if (current !== owner && (await FileSystem.readdir(profile)).length > 0) {
    Errors.ThrowUserInput(`Managed npm cache path is already owned: ${profile}`)
  }
  if (current === undefined) {
    await writeReadOnly(marker, owner)
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
    Errors.ThrowUserInput(`Managed npm durable lock is missing or changed for ${fingerprint}.`)
  }
}

async function ensureProfileManifest(
  profile: string,
  requirements: [string, string, string][],
  runtimePins: Record<string, string>,
  repair: boolean,
): Promise<void> {
  const manifest = {
    name: 'tao-managed-app',
    private: true,
    type: 'module',
    dependencies: allRequirements(requirements, runtimePins),
  }
  await ensureOwnedFile(Path.join(profile, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, repair)
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
      `Tao npm dependencies could not be prepared. Retry with: tao prepare --repair. ${result.stderr || result.stdout}`,
    )
  }
  const resultingLock = await FileSystem.readFile(lockfile, 'utf8')
  if (storedLock !== undefined && resultingLock !== storedLock) {
    Errors.ThrowUserInput(`Frozen Bun install changed the durable npm lock. Repair with: tao prepare --repair.`)
  }
}

async function persistProfile(
  profile: string,
  durableLock: string,
  storedLock: string | undefined,
  input: ManagedModulesInput,
  requirements: [string, string, string][],
  fingerprint: string,
  graphFingerprint: string,
  repair: boolean,
): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  const lock = await FileSystem.readFile(lockfile, 'utf8')
  if (storedLock === undefined) {
    await writeReadOnly(durableLock, lock)
    await writeReadOnly(durableLockHashPath(input, graphFingerprint), `${Platform.hashText(lock)}\n`)
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
  requirements: [string, string, string][],
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

function hasLegacyRequirementList(metadata: Record<string, unknown> | undefined): boolean {
  return Array.isArray(metadata?.requirements)
}
