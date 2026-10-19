import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { DependencyLock, DependencyRequirement, LockedSource, ManagedGraphReference } from './Types'

/** dependencyLockPath identifies the project's durable source dependency graph. */
export function dependencyLockPath(projectRoot: string): string {
  return Path.join(projectRoot, '.tao', 'store', 'dependencies.lock.json')
}

/** readDependencyLock reads a validated lock file without resolving or fetching sources. */
export async function readDependencyLock(path: string): Promise<DependencyLock | undefined> {
  if (!await FileSystem.exists(path)) {
    return undefined
  }
  const parsed = await Try(
    async () => JSON.parse(await FileSystem.readFile(path, 'utf8')) as unknown,
    {
      catch: () =>
        Errors.ThrowUserInput(
          `Dependency lock ${path} is invalid; restore it from version control or repair it explicitly.`,
        ),
    },
  )
  if (!isDependencyLock(parsed)) {
    Errors.ThrowUserInput(
      `Dependency lock ${path} is invalid; restore it from version control or repair it explicitly.`,
    )
  }
  return parsed
}

/** materializeLocations turns project-relative lock paths into current machine paths. */
export function materializeLocations(
  lock: DependencyLock | undefined,
  projectRoot: string,
  bundledProjects?: Readonly<Record<string, string>>,
): DependencyLock | undefined {
  return lock ? { ...lock, sources: materializeSources(lock.sources, projectRoot, bundledProjects) } : undefined
}

/** materializeSources resolves each relative source location against its project root. */
export function materializeSources(
  sources: Record<string, LockedSource>,
  projectRoot: string,
  bundledProjects?: Readonly<Record<string, string>>,
): Record<string, LockedSource> {
  return Object.fromEntries(
    Object.entries(sources).map(([identity, source]) => [
      identity,
      {
        ...source,
        location: source.provider === 'bundled'
          ? requiredBundledLocation(source.identifier, bundledProjects)
          : Path.resolve(projectRoot, source.location),
      },
    ]),
  )
}

/** readFileSourceRoots returns the materialized file-backed dependency roots. */
export async function readFileSourceRoots(projectRoot: string): Promise<string[]> {
  const lock = await readDependencyLock(dependencyLockPath(projectRoot))
  if (!lock) {
    return []
  }
  const roots = await Promise.all(
    Object.values(lock.sources)
      .filter(source => source.provider === 'file')
      .map(async source =>
        Try.WithDefault(
          Path.resolve(projectRoot, source.location),
          () => FileSystem.realpathSync(Path.resolve(projectRoot, source.location)),
        )
      ),
  )
  return [...new Set(roots)]
}

/** pruneUnreferencedManagedLocks removes only locks absent from source locks and retained profiles. */
export async function pruneUnreferencedManagedLocks(projectRoot: string): Promise<void> {
  const npmDirectory = Path.join(projectRoot, '.tao', 'store', 'npm')
  const profileDirectory = Path.join(projectRoot, '.tao', 'cache', 'managed-modules')
  if (!await FileSystem.exists(npmDirectory)) {
    return
  }
  const profiles = await retainedProfileIdentities(profileDirectory)
  if (profiles === undefined) {
    return
  }
  const lock = await readDependencyLock(dependencyLockPath(projectRoot))
  const currentLock = lock ? await pruneMissingGraphReferences(lock, projectRoot) : undefined
  const referencedPaths = new Set(Object.values(currentLock?.npmGraphs ?? {}).map(reference => reference.lockPath))
  for (const filename of await FileSystem.readdir(npmDirectory)) {
    if (!filename.endsWith('.lock') || profiles.has(filename.slice(0, -5))) {
      continue
    }
    const path = Path.join(npmDirectory, filename)
    const relative = Path.relative(projectRoot, path).replaceAll('\\', '/')
    if (referencedPaths.has(relative) || !isRegularFile(path)) {
      continue
    }
    await FileSystem.rm(path, { force: true })
    await FileSystem.rm(path.replace(/\.lock$/, '.sha256'), { force: true })
  }
}

/** writeDependencyLock atomically replaces the lock file with stable formatted JSON. */
export async function writeDependencyLock(path: string, lock: DependencyLock, projectRoot: string): Promise<void> {
  const contents = JSON.stringify(relativizeLocations(lock, projectRoot), null, 2) + '\n'
  const temporary = `${path}.${Platform.randomUUID()}.tmp`
  await Try(async () => {
    await FileSystem.writeFile(temporary, contents)
    await FileSystem.rename(temporary, path)
  }, { finally: () => FileSystem.rm(temporary, { force: true }) })
}

/** recordManagedGraphReference atomically records an exact npm graph lock reference. */
export async function recordManagedGraphReference(
  projectRoot: string,
  graphKey: string,
  fingerprint: string,
  durableLockPath: string,
  lockHash: string,
): Promise<DependencyLock> {
  validateGraphReference(graphKey, fingerprint, lockHash)
  const lockPath = dependencyLockPath(projectRoot)
  const lock = await readDependencyLock(lockPath)
    ?? { version: 1, roots: {}, sources: {} }
  const relativeLockPath = projectRelativePath(projectRoot, durableLockPath)
  const reference: ManagedGraphReference = { fingerprint, lockPath: relativeLockPath, lockHash }
  const updated: DependencyLock = { ...lock, npmGraphs: { ...lock.npmGraphs, [graphKey]: reference } }
  await FileSystem.mkdir(Path.dirname(lockPath), { recursive: true })
  await writeDependencyLock(lockPath, updated, projectRoot)
  return updated
}

type SerializedDependencyLock = Omit<DependencyLock, 'sources'> & {
  sources: Record<string, LockedSource | Omit<LockedSource, 'location'>>
}

function relativizeLocations(lock: DependencyLock, projectRoot: string): SerializedDependencyLock {
  return {
    ...lock,
    sources: Object.fromEntries(
      Object.entries(lock.sources).map(([identity, source]) => [
        identity,
        source.provider === 'bundled'
          ? omitLocation(source)
          : { ...source, location: serializedLocation(source.location, projectRoot) },
      ]),
    ),
  }
}

function omitLocation(source: LockedSource): Omit<LockedSource, 'location'> {
  const { location: _location, ...portable } = source
  return portable
}

function serializedLocation(location: string, projectRoot: string): string {
  return Path.isAbsolute(location)
    ? Path.relative(projectRoot, location).replaceAll('\\', '/')
    : location.replaceAll('\\', '/')
}

async function pruneMissingGraphReferences(lock: DependencyLock, projectRoot: string): Promise<DependencyLock> {
  const npmGraphs = { ...lock.npmGraphs }
  let changed = false
  for (const key of Object.keys(npmGraphs)) {
    if (!isOwnedSourceKey(key)) {
      continue
    }
    const sourcePath = Path.resolve(projectRoot, key)
    if (Path.isWithin(projectRoot, sourcePath) && !await FileSystem.exists(sourcePath)) {
      delete npmGraphs[key]
      changed = true
    }
  }
  if (!changed) {
    return lock
  }
  const updated = { ...lock, npmGraphs }
  await writeDependencyLock(dependencyLockPath(projectRoot), updated, projectRoot)
  return updated
}

function isOwnedSourceKey(key: string): boolean {
  return key.endsWith('.tao') && !key.includes('\\') && !key.startsWith('/') && !key.split('/').includes('..')
}

async function retainedProfileIdentities(directory: string): Promise<Set<string> | undefined> {
  if (!await FileSystem.exists(directory)) {
    return new Set()
  }
  const identities = new Set<string>()
  for (const profile of await FileSystem.readdir(directory)) {
    const root = Path.join(directory, profile)
    if (await FileSystem.exists(Path.join(root, '.tao-managed-building'))) {
      return undefined
    }
    const metadataPath = Path.join(root, '.tao-managed.json')
    const metadata = await Try.WithDefault(
      undefined,
      async () => JSON.parse(await FileSystem.readFile(metadataPath, 'utf8')) as Record<string, unknown>,
    )
    const identity = typeof metadata?.graphFingerprint === 'string' ? metadata.graphFingerprint : undefined
    if (!identity) {
      return undefined
    }
    identities.add(identity)
  }
  return identities
}

function isRegularFile(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isFile())
}

function validateGraphReference(key: string, fingerprint: string, hash: string): void {
  if (!isOwnedSourceKey(key)) {
    Errors.ThrowUserInput('Managed dependency graph key must be a safe project-relative identifier.')
  }
  if (!/^[a-f0-9]{64}$/i.test(fingerprint) || !/^[a-f0-9]{64}$/i.test(hash)) {
    Errors.ThrowUserInput('Managed dependency graph fingerprint and lock hash must be SHA-256 values.')
  }
}

function projectRelativePath(projectRoot: string, filePath: string): string {
  const absolute = Path.resolve(filePath)
  if (absolute === Path.resolve(projectRoot) || !Path.isWithin(projectRoot, absolute)) {
    Errors.ThrowUserInput('Managed dependency lock path must be inside the project.')
  }
  return Path.relative(Path.resolve(projectRoot), absolute).replaceAll('\\', '/')
}

function isDependencyLock(value: unknown): value is DependencyLock {
  if (!hasVersionOne(value)) {
    return false
  }
  if (!hasStringRoots(value)) {
    return false
  }
  if (!hasSources(value)) {
    return false
  }
  const entries = Object.entries(value.sources)
  return entries.every(([identity, source]) => isLockedSource(source) && source.identity === identity)
    && Object.values(value.roots).every(pin => {
      const separator = pin.lastIndexOf('@')
      return separator > 0 && entries.some(([identity]) => identity === pin.slice(0, separator))
    })
    && (!('npmGraphs' in value) || isGraphRecord(value.npmGraphs))
}

function hasVersionOne(value: unknown): value is Record<string, unknown> & { version: 1 } {
  return typeof value === 'object' && value !== null && 'version' in value && value.version === 1
}

function hasStringRoots(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { roots: Record<string, string> } {
  return 'roots' in value && isStringRecord(value.roots)
}

function hasSources(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { sources: Record<string, unknown> } {
  return 'sources' in value && typeof value.sources === 'object' && value.sources !== null
}

function isGraphRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && Object.entries(value).every(([key, reference]) => {
      return isOwnedSourceKey(key) && isManagedGraphReference(reference)
    })
}

function isManagedGraphReference(value: unknown): value is ManagedGraphReference {
  return typeof value === 'object' && value !== null
    && 'fingerprint' in value && isSha256(value.fingerprint)
    && 'lockHash' in value && isSha256(value.lockHash)
    && 'lockPath' in value && isSafeRelativePath(value.lockPath)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function isSafeRelativePath(value: unknown): value is string {
  return typeof value === 'string' && !Path.isAbsolute(value) && !value.includes('\\')
    && !value.split('/').includes('..')
}

function isLockedSource(value: unknown): value is LockedSource {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return 'identity' in value && typeof value.identity === 'string'
    && 'provider' in value && ['github', 'file', 'bundled'].includes(String(value.provider))
    && 'identifier' in value && typeof value.identifier === 'string'
    && 'version' in value && typeof value.version === 'string'
    && (value.provider === 'bundled' || 'location' in value && typeof value.location === 'string')
    && 'requirements' in value && Array.isArray(value.requirements) && value.requirements.every(isRequirement)
    && (value.provider === 'github' ? isCommit((value as Record<string, unknown>).commit) : !('commit' in value))
    && (!('subdirectory' in value) || typeof value.subdirectory === 'string')
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(value)
}

function isRequirement(value: unknown): value is DependencyRequirement {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return 'provider' in value && ['github', 'file', 'bundled'].includes(String(value.provider))
    && 'identifier' in value && typeof value.identifier === 'string'
    && 'version' in value && typeof value.version === 'string'
    && (!('alias' in value) || typeof value.alias === 'string')
    && (!('subdirectory' in value) || typeof value.subdirectory === 'string')
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && Object.values(value).every(item => typeof item === 'string')
}

function requiredBundledLocation(
  identifier: string,
  bundledProjects: Readonly<Record<string, string>> | undefined,
): string {
  const location = bundledProjects?.[identifier]
  if (!location) {
    Errors.ThrowUserInput(`Bundled dependency ${identifier} is unavailable in this runtime.`)
  }
  return location
}
