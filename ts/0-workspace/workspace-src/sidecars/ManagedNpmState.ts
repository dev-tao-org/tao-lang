import { Errors, Try } from '@shared'
import { Files, FileSystem, Path, Platform } from '@shared/os'
import { allRequirements, defaultSingletonPackages } from './ManagedModuleGraph'
import { typeScriptDefaultsHash } from './ManagedModuleMetadata'
import type { ManagedModulesInput } from './ManagedModuleTypes'

/** validateProfileMetadata checks a managed graph's declarations against its immutable cache marker. */
export async function validateProfileMetadata(
  metadata: Record<string, unknown>,
  input: ManagedModulesInput,
  fingerprint: string,
  requirements: [string, string, string][],
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
    const owner = requirements[0]?.[2].split('\n')[1] ?? 'project runtime'
    Errors.ThrowUserInput(
      `Managed npm dependencies changed. Repair with: tao prepare --repair (owning declaration: ${owner})`,
    )
  }
}

/** ensureOwnedFile checks generated state and rewrites it only during explicit repair. */
export async function ensureOwnedFile(path: string, contents: string, repair: boolean): Promise<void> {
  const current = await optionalText(path)
  if (current !== undefined && current !== contents && !repair) {
    Errors.ThrowUserInput(`Managed npm metadata drifted. Repair with: tao prepare --repair.`)
  }
  if (current !== contents) {
    await writeReadOnly(path, contents)
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
  if (parsed?.fingerprint === fingerprint && typeof parsed.lockHash === 'string') {
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
  return await Try(() => JSON.parse(text) as Record<string, unknown>, {
    catch: () => Errors.ThrowUserInput(`Managed npm state is invalid at ${path}.`),
  })
}

/** writeReadOnly writes generated state and restores its read-only permissions. */
export async function writeReadOnly(path: string, contents: string): Promise<void> {
  await Files.writeReadOnly(path, contents)
}

function profileRequirementsMatch(value: unknown, requirements: [string, string, string][]): boolean {
  const expected = allRequirements(requirements)
  if (isStringRecord(value)) {
    return sameStringRecord(value, expected)
  }
  if (!isRequirementList(value)) {
    return false
  }
  const actual = Try.WithDefault(undefined, () => allRequirements(value))
  return actual !== undefined && sameStringRecord(actual, expected)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(item => typeof item === 'string')
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isRequirementList(value: unknown): value is [string, string, string][] {
  return Array.isArray(value)
    && value.every(item => Array.isArray(item) && item.length === 3 && item.every(part => typeof part === 'string'))
}
