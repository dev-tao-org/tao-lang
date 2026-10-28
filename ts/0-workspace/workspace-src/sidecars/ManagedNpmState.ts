import { Errors, Try } from '@shared'
import { Files, FileSystem, Path, Platform } from '@shared/os'
import { collectAllRequirements, defaultSingletonPackages } from './ManagedModuleGraph'
import { typeScriptDefaultsHash } from './ManagedModuleMetadata'
import * as ManagedTypes from './ManagedModuleTypes'
import { describeManagedResolutionPolicy } from './ManagedNpmPolicy'

/** ManagedProfileMetadata maps generated install-profile marker fields to unvalidated values. */
export type ManagedProfileMetadata = Record<string, unknown>

type ManagedDurableLock = string | undefined
type MaybeManagedProfileMetadata = ManagedProfileMetadata | undefined

/** validateProfileMetadata checks a managed graph's declarations against its immutable cache marker. */
export async function validateProfileMetadata(
  metadata: ManagedProfileMetadata,
  input: ManagedTypes.ManagedModulesInput,
  fingerprint: string,
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  graphFingerprint: string,
): Promise<void> {
  if (!profileMetadataMatches(metadata, input, fingerprint, requirements, graphFingerprint)) {
    const owner = requirements[0]?.origin ?? 'project runtime'
    Errors.ThrowUserInput(
      `Managed npm dependencies changed. Repair with: tao setup --repair (owning declaration: ${owner})`,
    )
  }
}

function profileMetadataMatches(
  metadata: ManagedProfileMetadata,
  input: ManagedTypes.ManagedModulesInput,
  fingerprint: string,
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  graphFingerprint: string,
): boolean {
  if (metadata.fingerprint !== fingerprint || metadata.graphFingerprint !== graphFingerprint) {
    return false
  }
  if (metadata.target !== input.target || metadata.bunVersion !== input.bunVersion) {
    return false
  }
  if (metadata.policyRegistryVersion !== 1 || metadata.typeScriptDefaultsHash !== typeScriptDefaultsHash()) {
    return false
  }
  if (!sameManagedPackageVersions(metadata.runtimePins, input.runtimePins)) {
    return false
  }
  const expectedSingletons = input.singletonPackages ?? defaultSingletonPackages
  if (!sameSerializedSingletonPackages(metadata.singletonPackages, expectedSingletons)) {
    return false
  }
  return profileRequirementsMatch(metadata.requirements, requirements)
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
  durableLock: ManagedDurableLock,
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
    const metadata = Try.WithDefault(undefined, () => parseManagedProfileMetadata(metadataText))
    if (
      hasMatchingMetadataLock(metadata, fingerprint, durableLock)
    ) {
      return
    }
    if (!repair || durableLock === undefined) {
      if (durableLock === undefined) {
        Errors.ThrowUserInput(
          `Managed npm durable lock is missing for ${fingerprint}; restore it and its SHA-256 file from version control.`,
        )
      }
      Errors.ThrowUserInput(`Managed npm cache path is already owned or cannot be verified: ${profile}`)
    }
    if (
      hasConflictingProfileFingerprint(metadata, fingerprint)
      || !await profileContentsMatch(profile, durableLock, expectedManifest)
    ) {
      Errors.ThrowUserInput(`Managed npm cache path is already owned or cannot be verified: ${profile}`)
    }
    return
  }
  if (current !== owner && (await FileSystem.readdir(profile)).length > 0) {
    if (!repair || durableLock === undefined) {
      Errors.ThrowUserInput(`Managed npm cache path is already owned: ${profile}`)
    }
    if (!await profileContentsMatch(profile, durableLock, expectedManifest)) {
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
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins,
  runtimePolicy?: ManagedTypes.ManagedRuntimePolicy,
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
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins,
  runtimePolicy?: ManagedTypes.ManagedRuntimePolicy,
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
  durableLock: ManagedDurableLock,
): Promise<ManagedProfileMetadata | undefined> {
  const path = Path.join(profile, '.tao-managed.json')
  const text = await optionalText(path)
  if (text === undefined || !repair) {
    return await optionalJson(path)
  }
  const parsed = await Try.WithDefault(undefined, () => parseManagedProfileMetadata(text))
  if (hasMatchingMetadataLock(parsed, fingerprint, durableLock)) {
    return parsed as ManagedProfileMetadata
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
export async function optionalJson(path: string): Promise<ManagedProfileMetadata | undefined> {
  const text = await optionalText(path)
  if (text === undefined) {
    return undefined
  }
  const value = await Try(() => parseManagedProfileMetadata(text), {
    catch: () => Errors.ThrowUserInput(`Managed npm state is invalid at ${path}. Repair with: tao setup --repair.`),
  })
  if (!isObjectRecord(value)) {
    Errors.ThrowUserInput(`Managed npm state is invalid at ${path}. Repair with: tao setup --repair.`)
  }
  return value
}

/** writeReadOnly writes generated state and restores its read-only permissions. */
export async function writeReadOnly(path: string, contents: string): Promise<void> {
  await Files.writeReadOnly(path, contents)
}

async function profileContentsMatch(profile: string, durableLock: string, expectedManifest: string): Promise<boolean> {
  return await optionalText(Path.join(profile, 'bun.lock')) === durableLock
    && await optionalText(Path.join(profile, 'package.json')) === expectedManifest
}

function hasConflictingProfileFingerprint(metadata: unknown, fingerprint: string): boolean {
  const profileMetadata = metadata as MaybeManagedProfileMetadata
  return profileMetadata?.fingerprint !== undefined && profileMetadata.fingerprint !== fingerprint
}

function hasMatchingMetadataLock(
  metadata: unknown,
  fingerprint: string,
  durableLock: ManagedDurableLock,
): boolean {
  const profileMetadata = metadata as MaybeManagedProfileMetadata
  if (profileMetadata?.fingerprint !== fingerprint || typeof profileMetadata.lockHash !== 'string') {
    return false
  }
  return durableLock === undefined || profileMetadata.lockHash === Platform.hashText(durableLock)
}

function profileRequirementsMatch(
  value: unknown,
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
): boolean {
  const expected = collectAllRequirements(requirements)
  return isStringRecord(value) && sameStringRecord(value, expected)
}

function isStringRecord(value: unknown): value is ManagedTypes.ManagedPackageVersionMap {
  return isObjectRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isObjectRecord(value: unknown): value is ManagedProfileMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameStringRecord(
  left: ManagedTypes.ManagedPackageVersionMap,
  right: ManagedTypes.ManagedPackageVersionMap,
): boolean {
  return sameManagedPackageVersions(left, right)
}

function parseManagedProfileMetadata(contents: string): unknown {
  return JSON.parse(contents) as unknown
}

function sameManagedPackageVersions(left: unknown, right: ManagedTypes.ManagedRuntimePins): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameSerializedSingletonPackages(left: unknown, right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
