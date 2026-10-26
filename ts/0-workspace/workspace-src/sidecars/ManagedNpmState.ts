import { Errors, Try } from '@shared'
import { Files, FileSystem, Path, Platform } from '@shared/os'
import { collectAllRequirements, defaultSingletonPackages } from './ManagedModuleGraph'
import { typeScriptDefaultsHash } from './ManagedModuleMetadata'
import type { ManagedModulesInput, ManagedRuntimePolicy, NormalizedManagedRequirement } from './ManagedModuleTypes'
import { describeManagedResolutionPolicy } from './ManagedNpmPolicy'

/** validateProfileMetadata checks a managed graph's declarations against its immutable cache marker. */
export async function validateProfileMetadata(
  metadata: Record<string, unknown>,
  input: ManagedModulesInput,
  fingerprint: string,
  requirements: readonly NormalizedManagedRequirement[],
  graphFingerprint: string,
): Promise<void> {
  if (
    metadata.fingerprint !== fingerprint || metadata.graphFingerprint !== graphFingerprint
    || metadata.target !== input.target || metadata.bunVersion !== input.bunVersion
    || metadata.policyRegistryVersion !== 1 || metadata.typeScriptDefaultsHash !== typeScriptDefaultsHash()
    || JSON.stringify(metadata.runtimePins) !== JSON.stringify(input.runtimePins)
    || JSON.stringify(metadata.singletonPackages)
      !== JSON.stringify(input.singletonPackages ?? defaultSingletonPackages)
    || !profileRequirementsMatch(metadata.requirements, requirements)
  ) {
    const owner = requirements[0]?.origin ?? 'project runtime'
    Errors.ThrowUserInput(
      `Managed npm dependencies changed. Repair with: tao setup --repair (owning declaration: ${owner})`,
    )
  }
}

/** ensureOwnedFile checks generated state and rewrites it only during explicit repair. */
export async function ensureOwnedFile(path: string, contents: string, repair: boolean): Promise<void> {
  const current = await optionalText(path)
  if (current !== undefined && current !== contents && !repair) {
    Errors.ThrowUserInput(`Managed npm metadata drifted. Repair with: tao setup --repair.`)
  }
  if (current !== contents) {
    await writeReadOnly(path, contents)
  }
}

/** claimManagedProfile accepts damaged ownership metadata only when its current lock and manifest prove ownership. */
export async function claimManagedProfile(
  profile: string,
  fingerprint: string,
  repair: boolean,
  durableLock: string | undefined,
  expectedManifest: string,
): Promise<void> {
  const metadataPath = Path.join(profile, '.tao-managed.json')
  const marker = Path.join(profile, '.tao-managed-building')
  const owner = `${fingerprint}\n`
  const current = await optionalText(marker)
  if (current !== undefined && current !== owner) {
    Errors.ThrowUserInput(`Managed npm cache path is already owned: ${profile}`)
  }
  const metadataText = await optionalText(metadataPath)
  if (metadataText !== undefined) {
    const metadata = Try.WithDefault(undefined, () => JSON.parse(metadataText) as Record<string, unknown>)
    if (
      metadata?.fingerprint === fingerprint && typeof metadata.lockHash === 'string'
      && (durableLock === undefined || metadata.lockHash === Platform.hashText(durableLock))
    ) {
      return
    }
    if (
      !repair || durableLock === undefined
      || metadata?.fingerprint !== undefined && metadata.fingerprint !== fingerprint
      || !await profileContentsMatch(profile, durableLock, expectedManifest)
    ) {
      if (durableLock === undefined) {
        Errors.ThrowUserInput(
          `Managed npm durable lock is missing for ${fingerprint}; restore it and its SHA-256 file from version control.`,
        )
      }
      Errors.ThrowUserInput(`Managed npm cache path is already owned or cannot be verified: ${profile}`)
    }
    return
  }
  if (current !== owner && (await FileSystem.readdir(profile)).length > 0) {
    if (!repair || durableLock === undefined || !await profileContentsMatch(profile, durableLock, expectedManifest)) {
      Errors.ThrowUserInput(`Managed npm cache path is already owned: ${profile}`)
    }
    return
  }
  if (current === undefined) {
    await writeReadOnly(marker, owner)
  }
}

/** createManagedProfileManifest serializes exact top-level dependencies for the prepared graph. */
export function createManagedProfileManifest(
  requirements: readonly NormalizedManagedRequirement[],
  runtimePins: Record<string, string>,
  runtimePolicy?: ManagedRuntimePolicy,
): string {
  return `${
    JSON.stringify(
      {
        name: 'tao-managed-app',
        private: true,
        type: 'module',
        dependencies: collectAllRequirements(requirements, runtimePins),
        ...describeManagedResolutionPolicy(runtimePolicy),
      },
      null,
      2,
    )
  }\n`
}

/** validateManagedManifest checks the generated exact dependency manifest against declarations. */
export async function validateManagedManifest(
  profile: string,
  requirements: readonly NormalizedManagedRequirement[],
  runtimePins: Record<string, string>,
  runtimePolicy?: ManagedRuntimePolicy,
): Promise<void> {
  const expected = createManagedProfileManifest(requirements, runtimePins, runtimePolicy)
  const path = Path.join(profile, 'package.json')
  if (!await FileSystem.exists(path) || await FileSystem.readFile(path, 'utf8') !== expected) {
    Errors.ThrowUserInput('Managed npm manifest drifted. Repair with: tao setup --repair.')
  }
}

/** validateManagedProfilePath rejects links and escapes within the generated cache path. */
export function validateManagedProfilePath(projectRoot: string, profile: string): void {
  if (!Path.isWithin(projectRoot, profile)) {
    Errors.ThrowUserInput(`Managed npm cache path is outside the project: ${profile}`)
  }
  let directory = profile
  while (Path.resolve(directory) !== Path.resolve(projectRoot)) {
    const stat = Try.WithDefault(undefined, () => FileSystem.lstatSync(directory))
    if (stat?.isSymbolicLink()) {
      Errors.ThrowUserInput(`Managed npm cache path cannot be a symbolic link: ${directory}`)
    }
    directory = Path.dirname(directory)
  }
}

/** readOwnedMetadata tolerates damaged generated metadata only when its durable lock proves ownership. */
export async function readOwnedMetadata(
  profile: string,
  fingerprint: string,
  repair: boolean,
  durableLock: string | undefined,
): Promise<Record<string, unknown> | undefined> {
  const path = Path.join(profile, '.tao-managed.json')
  const text = await optionalText(path)
  if (text === undefined || !repair) {
    return await optionalJson(path)
  }
  const parsed = await Try.WithDefault(undefined, () => JSON.parse(text) as Record<string, unknown>)
  if (
    parsed?.fingerprint === fingerprint && typeof parsed.lockHash === 'string'
    && (durableLock === undefined || parsed.lockHash === Platform.hashText(durableLock))
  ) {
    return parsed
  }
  if (durableLock === undefined) {
    Errors.ThrowUserInput(`Managed npm metadata ownership cannot be verified for ${profile}.`)
  }
  return { fingerprint, lockHash: Platform.hashText(durableLock) }
}

/** optionalText reads an owned state file after rejecting symbolic links. */
export async function optionalText(path: string): Promise<string | undefined> {
  if (FileSystem.existsSync(path) && FileSystem.lstatSync(path).isSymbolicLink()) {
    Errors.ThrowUserInput(`Managed npm path cannot be a symbolic link: ${path}`)
  }
  return await FileSystem.exists(path) ? await FileSystem.readFile(path, 'utf8') : undefined
}

/** optionalJson parses an optional generated state file with a Tao diagnostic on malformed content. */
export async function optionalJson(path: string): Promise<Record<string, unknown> | undefined> {
  const text = await optionalText(path)
  if (text === undefined) {
    return undefined
  }
  const value = await Try(() => JSON.parse(text) as unknown, {
    catch: () => Errors.ThrowUserInput(`Managed npm state is invalid at ${path}. Repair with: tao setup --repair.`),
  })
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    Errors.ThrowUserInput(`Managed npm state is invalid at ${path}. Repair with: tao setup --repair.`)
  }
  return value as Record<string, unknown>
}

/** writeReadOnly writes generated state and restores its read-only permissions. */
export async function writeReadOnly(path: string, contents: string): Promise<void> {
  await Files.writeReadOnly(path, contents)
}

async function profileContentsMatch(profile: string, durableLock: string, expectedManifest: string): Promise<boolean> {
  return await optionalText(Path.join(profile, 'bun.lock')) === durableLock
    && await optionalText(Path.join(profile, 'package.json')) === expectedManifest
}

function profileRequirementsMatch(value: unknown, requirements: readonly NormalizedManagedRequirement[]): boolean {
  const expected = collectAllRequirements(requirements)
  return isStringRecord(value) && sameStringRecord(value, expected)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(item => typeof item === 'string')
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
