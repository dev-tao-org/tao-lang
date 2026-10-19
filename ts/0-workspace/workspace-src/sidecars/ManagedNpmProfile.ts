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
  const fingerprint = fingerprintFor(input, normalized)
  const profile = profilePath(input, fingerprint)
  await prepareProfile(input, normalized, fingerprint, profile, executor, repair)
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
  const fingerprint = fingerprintFor(input, normalized)
  const profile = profilePath(input, fingerprint)
  const metadata = await readProfileMetadata(profile, normalized)
  await validateProfileMetadata(metadata, input, fingerprint, normalized)
  validateInstalledHost(metadata, input)
  const lockfile = Path.join(profile, 'bun.lock')
  const durableLock = durableLockPath(input, fingerprint)
  const durableHash = durableLockHashPath(input, fingerprint)
  const lock = await readManagedLock(lockfile, durableLock, durableHash, fingerprint)
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

function fingerprintFor(input: ManagedModulesInput, normalized: [string, string, string][]): string {
  return Platform.hashText(JSON.stringify({
    normalized: normalized.map(([directory, name, value]) => [
      Path.relative(input.directory, directory).replaceAll('\\', '/'),
      name,
      value.split('\n')[0],
    ]).sort((left, right) => left.join('\0').localeCompare(right.join('\0'))),
    target: input.target,
    runtimePins: Object.fromEntries(
      Object.entries(input.runtimePins).sort(([left], [right]) => left.localeCompare(right)),
    ),
    bunVersion: input.bunVersion,
    singletonPackages: [...input.singletonPackages ?? defaultSingletonPackages].sort(),
    policyRegistryVersion: 1,
    typeScriptDefaultsHash: typeScriptDefaultsHash(),
  }))
}

function profilePath(input: ManagedModulesInput, fingerprint: string): string {
  return Path.join(input.directory, '.tao', 'cache', 'managed-modules', fingerprint)
}

function durableLockPath(input: ManagedModulesInput, fingerprint: string): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${fingerprint}.lock`)
}

function durableLockHashPath(input: ManagedModulesInput, fingerprint: string): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${fingerprint}.sha256`)
}

async function prepareProfile(
  input: ManagedModulesInput,
  normalized: [string, string, string][],
  fingerprint: string,
  profile: string,
  executor: BunExecutor,
  repair: boolean,
): Promise<void> {
  const durableLock = durableLockPath(input, fingerprint)
  await FileSystem.mkdir(profile, { recursive: true })
  await FileSystem.mkdir(Path.dirname(durableLock), { recursive: true })
  await claimProfile(profile, fingerprint)
  const storedLock = await optionalText(durableLock)
  const storedHash = await optionalText(durableLockHashPath(input, fingerprint))
  validateDurableLock(storedLock, storedHash, fingerprint)
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
      storedLock,
      repair,
    )
  }
  await validateBunVersion(input, executor)
  await ensureProfileManifest(profile, normalized, input.runtimePins, repair || storedLock === undefined)
  await installFrozenGraph(profile, storedLock, executor, repair)
  await validateGraph(profile, normalized, input.runtimePins)
  await auditInstalledGraph(profile, input, normalized)
  await persistProfile(profile, durableLock, storedLock, input, normalized, fingerprint, repair || rebuildHostInstall)
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
  repair: boolean,
): Promise<void> {
  const lockfile = Path.join(profile, 'bun.lock')
  const lock = await FileSystem.readFile(lockfile, 'utf8')
  if (storedLock === undefined) {
    await writeReadOnly(durableLock, lock)
    await writeReadOnly(durableLockHashPath(input, fingerprint), `${Platform.hashText(lock)}\n`)
  }
  const nativePackages = await nativePackageNames(profile)
  await ensureTypeScriptDefaults(input.directory)
  const metadata = profileMetadata(input, requirements, fingerprint, lock, nativePackages)
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
  lock: string,
  nativePackages: string[],
): Record<string, unknown> {
  return {
    fingerprint,
    target: input.target,
    bunVersion: input.bunVersion,
    runtimePins: input.runtimePins,
    requirements,
    singletonPackages: input.singletonPackages ?? defaultSingletonPackages,
    policyRegistryVersion: 1,
    typeScriptDefaultsHash: typeScriptDefaultsHash(),
    lockHash: Platform.hashText(lock),
    installHost: installHostIdentity(input),
    nativePackages,
  }
}

async function readProfileMetadata(
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

async function readManagedLock(
  profileLock: string,
  durableLock: string,
  durableHash: string,
  fingerprint: string,
): Promise<string> {
  const profile = await optionalText(profileLock)
  const durable = await optionalText(durableLock)
  const hash = await optionalText(durableHash)
  if (!profile || !durable) {
    Errors.ThrowUserInput(`Managed npm lock is missing. Repair with: tao prepare --repair.`)
  }
  validateDurableLock(durable, hash, fingerprint)
  if (profile !== durable) {
    Errors.ThrowUserInput(`Managed npm lock copies differ. Repair with: tao prepare --repair.`)
  }
  return profile
}

function validateDurableLock(lock: string | undefined, hash: string | undefined, fingerprint: string): void {
  if ((lock === undefined) !== (hash === undefined) || lock !== undefined && hash !== `${Platform.hashText(lock)}\n`) {
    Errors.ThrowUserInput(`Managed npm durable lock is changed or incomplete for ${fingerprint}.`)
  }
}
