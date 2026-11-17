import * as Runtime from '@runtime'
import { Json, NewlineCharacter, Objects, Try, UserInput } from '@shared'
import { Files, FS, Path, Platform } from '@shared/os'
import { collectAllRequirements } from '../ManagedModule/ManagedModuleGraph'
import { typeScriptDefaultsHash } from '../ManagedModule/ManagedModuleMetadata'
import * as ManagedTypes from '../ManagedModule/ManagedModuleTypes'
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
    UserInput.Fail(`Managed npm dependencies changed. Repair with: tao setup --repair (owning declaration: ${owner})`)
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
  const expectedSingletons = Runtime.resolveRuntimeSingletonPackages(input.singletonPackages)
  if (!sameSerializedSingletonPackages(metadata.singletonPackages, expectedSingletons)) {
    return false
  }
  return profileRequirementsMatch(metadata.requirements, requirements)
}

/** ensureOwnedFile checks generated state and rewrites it only during explicit repair. */
export async function ensureOwnedFile(path: string, contents: string, repair: boolean): Promise<void> {
  const current = await optionalText(path)
  if (current !== undefined && current !== contents && !repair) {
    UserInput.Fail(`Managed npm metadata drifted. Repair with: tao setup --repair.`)
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
  const owner = `${fingerprint}${NewlineCharacter}`
  const current = await optionalText(marker)
  if (current !== undefined && current !== owner) {
    UserInput.Fail(`Managed npm cache path is already owned: ${profile}`)
  }
  const metadataText = await optionalText(metadataPath)
  if (metadataText !== undefined) {
    const metadata = Try.WithDefault(undefined, () => parseManagedProfileMetadata(metadataText))
    if (hasMatchingMetadataLock(metadata, fingerprint, durableLock)) {
      return
    }
    if (!repair || durableLock === undefined) {
      if (durableLock === undefined) {
        UserInput.Fail(
          `Managed npm durable lock is missing for ${fingerprint}; restore it and its SHA-256 file from version control.`,
        )
      }
      UserInput.Fail(`Managed npm cache path is already owned or cannot be verified: ${profile}`)
    }
    if (
      hasConflictingProfileFingerprint(metadata, fingerprint)
      || !await profileContentsMatch(profile, durableLock, expectedManifest)
    ) {
      UserInput.Fail(`Managed npm cache path is already owned or cannot be verified: ${profile}`)
    }
    return
  }
  if (current !== owner && !await FS.isEmptyDir(profile)) {
    if (!repair || durableLock === undefined) {
      UserInput.Fail(`Managed npm cache path is already owned: ${profile}`)
    }
    if (!await profileContentsMatch(profile, durableLock, expectedManifest)) {
      UserInput.Fail(`Managed npm cache path is already owned: ${profile}`)
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
    Json.Print({
      name: 'tao-managed-app',
      private: true,
      type: 'module',
      dependencies: collectAllRequirements(requirements, runtimePins),
      ...describeManagedResolutionPolicy(runtimePolicy),
    })
  }${NewlineCharacter}`
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
  UserInput.Require(
    !(!await FS.exists(path) || await FS.readFile(path, 'utf8') !== expected),
    'Managed npm manifest drifted. Repair with: tao setup --repair.',
  )
}

/** validateManagedProfilePath rejects links and escapes within the generated cache path. */
export function validateManagedProfilePath(projectRoot: string, profile: string): void {
  if (!Path.isWithin(projectRoot, profile)) {
    UserInput.Fail(`Managed npm cache path is outside the project: ${profile}`)
  }
  let directory = profile
  while (Path.resolve(directory) !== Path.resolve(projectRoot)) {
    const stat = Try.WithDefault(undefined, () => FS.lstatSync(directory))
    if (stat?.isSymbolicLink()) {
      UserInput.Fail(`Managed npm cache path cannot be a symbolic link: ${directory}`)
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
    return parsed
  }
  if (durableLock === undefined) {
    UserInput.Fail(`Managed npm metadata ownership cannot be verified for ${profile}.`)
  }
  return { fingerprint, lockHash: Platform.hashText(durableLock) }
}

/** optionalText reads an owned state file after rejecting symbolic links. */
export async function optionalText(path: string): Promise<string | undefined> {
  if (FS.existsSync(path) && FS.lstatSync(path).isSymbolicLink()) {
    UserInput.Fail(`Managed npm path cannot be a symbolic link: ${path}`)
  }
  return await FS.exists(path) ? await FS.readFile(path, 'utf8') : undefined
}

/** optionalJson parses an optional generated state file with a Tao diagnostic on malformed content. */
export async function optionalJson(path: string): Promise<ManagedProfileMetadata | undefined> {
  const text = await optionalText(path)
  if (text === undefined) {
    return undefined
  }
  const value = await Try(() => parseManagedProfileMetadata(text), {
    catch: () => UserInput.Fail(`Managed npm state is invalid at ${path}. Repair with: tao setup --repair.`),
  })
  if (!isObjectRecord(value)) {
    UserInput.Fail(`Managed npm state is invalid at ${path}. Repair with: tao setup --repair.`)
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

function hasConflictingProfileFingerprint(metadata: MaybeManagedProfileMetadata, fingerprint: string): boolean {
  return metadata?.fingerprint !== undefined && metadata.fingerprint !== fingerprint
}

function hasMatchingMetadataLock(
  metadata: MaybeManagedProfileMetadata,
  fingerprint: string,
  durableLock: ManagedDurableLock,
): metadata is ManagedProfileMetadata {
  if (metadata?.fingerprint !== fingerprint || typeof metadata.lockHash !== 'string') {
    return false
  }
  return durableLock === undefined || metadata.lockHash === Platform.hashText(durableLock)
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

function parseManagedProfileMetadata(contents: string): MaybeManagedProfileMetadata {
  const value: unknown = Json.Parse(contents)
  return isObjectRecord(value) ? value : undefined
}

function sameManagedPackageVersions(left: unknown, right: ManagedTypes.ManagedRuntimePins): boolean {
  return Objects.equal(left, right)
}

function sameSerializedSingletonPackages(left: unknown, right: readonly string[]): boolean {
  return Objects.equal(left, right)
}
