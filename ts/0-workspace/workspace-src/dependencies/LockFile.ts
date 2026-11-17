import { Json, Lists, NewlineCharacter, Objects, Regxs, Try, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { isDependencyLock, isOwnedSourceKey, isVersionOne } from './LockFileSchema'
import type * as Types from './Types'

/** resolveDependencyLockPath locates the project's durable source dependency graph. */
export function resolveDependencyLockPath(projectRoot: string): string {
  return Path.join(projectRoot, '.tao', 'store', 'dependencies.lock.json')
}

/** readDependencyLock reads a validated lock file without resolving or fetching sources. */
export async function readDependencyLock(path: string): Promise<Types.DependencyLock | undefined> {
  if (!await FS.exists(path)) {
    return undefined
  }
  const parsed = await Try(
    () => parseDependencyLockFile(path),
    {
      catch: () =>
        UserInput.Fail(`Dependency lock ${path} is invalid; restore it from version control or repair it explicitly.`),
    },
  )
  if (!isDependencyLock(parsed)) {
    if (isVersionOne(parsed)) {
      UserInput.Fail(
        `Dependency lock ${path} uses unsupported format version 1; restore an updated version 2 lock without re-resolving pins.`,
      )
    }
    UserInput.Fail(`Dependency lock ${path} is invalid; restore it from version control or repair it explicitly.`)
  }
  return parsed
}

type OptionalDependencyLock = Types.DependencyLock | undefined
/** materializeLocations turns project-relative lock paths into current machine paths. */
export function materializeLocations(
  lock: OptionalDependencyLock,
  projectRoot: string,
  bundledProjects?: Types.BundledProjectDirectories,
): Types.DependencyLock | undefined {
  return lock ? { ...lock, sources: materializeSources(lock.sources, projectRoot, bundledProjects) } : undefined
}

/** materializeSources resolves each relative source location against its project root. */
export function materializeSources(
  sources: Types.DependencySources,
  projectRoot: string,
  bundledProjects?: Types.BundledProjectDirectories,
): Types.DependencySources {
  return Object.fromEntries(
    Object.entries(sources).map(([identity, source]) => [
      identity,
      materializeSource(source, projectRoot, bundledProjects),
    ]),
  )
}

/** readFileSourceRoots returns the materialized file-backed dependency roots. */
export async function readFileSourceRoots(projectRoot: string): Promise<string[]> {
  const lock = await readDependencyLock(resolveDependencyLockPath(projectRoot))
  if (!lock) {
    return []
  }
  const roots = await Promise.all(
    Object.values(lock.sources)
      .filter(source => source.provider === 'file')
      .map(async source =>
        Try.WithDefault(
          Path.resolve(projectRoot, source.location),
          () => FS.realpathSync(Path.resolve(projectRoot, source.location)),
        )
      ),
  )
  return Lists.unique(roots)
}

/** pruneUnreferencedManagedLocks removes only locks absent from source locks and retained profiles. */
export async function pruneUnreferencedManagedLocks(projectRoot: string): Promise<void> {
  const npmDirectory = Path.join(projectRoot, '.tao', 'store', 'npm')
  const profileDirectory = Path.join(projectRoot, '.tao', 'cache', 'managed-modules')
  if (!await FS.exists(npmDirectory)) {
    return
  }
  const profiles = await retainedProfileIdentities(profileDirectory)
  if (profiles === undefined) {
    return
  }
  const lock = await readDependencyLock(resolveDependencyLockPath(projectRoot))
  const currentLock = lock ? await pruneMissingGraphReferences(lock, projectRoot) : undefined
  const referencedPaths = new Set(Object.values(currentLock?.npmGraphs ?? {}).map(reference => reference.lockPath))
  for (const filename of await FS.readdir(npmDirectory)) {
    if (!filename.endsWith('.lock') || profiles.has(filename.slice(0, -5))) {
      continue
    }
    const path = Path.join(npmDirectory, filename)
    const relative = Path.relative(projectRoot, path).replaceAll('\\', '/')
    if (referencedPaths.has(relative) || !isRegularFile(path)) {
      continue
    }
    await FS.rm(path, { force: true })
    await FS.rm(path.replace(Regxs.LockFileExtensionRegx, '.sha256'), { force: true })
  }
}

/** writeDependencyLock atomically replaces the lock file with stable formatted JSON. */
export async function writeDependencyLock(
  path: string,
  lock: Types.DependencyLock,
  projectRoot: string,
): Promise<void> {
  const contents = serializeDependencyLock(lock, projectRoot)
  const temporary = `${path}.${Platform.randomUUID()}.tmp`
  await Try(async () => {
    await FS.writeFile(temporary, contents)
    await FS.rename(temporary, path)
  }, { finally: () => FS.rm(temporary, { force: true }) })
}

/** recordManagedGraphReference atomically records an exact npm graph lock reference. */
export async function recordManagedGraphReference(
  projectRoot: string,
  graphKey: string,
  fingerprint: string,
  durableLockPath: string,
  lockHash: string,
): Promise<Types.DependencyLock> {
  validateGraphReference(graphKey, fingerprint, lockHash)
  const lockPath = resolveDependencyLockPath(projectRoot)
  const storedLock = await readDependencyLock(lockPath)
  const lock: Types.DependencyLock = storedLock === undefined
    ? { version: 2, roots: {}, sources: {}, commitPins: {} }
    : storedLock
  const relativeLockPath = relativizeProjectPath(projectRoot, durableLockPath)
  const reference: Types.ManagedGraphReference = { fingerprint, lockPath: relativeLockPath, lockHash }
  const updated: Types.DependencyLock = { ...lock, npmGraphs: { ...lock.npmGraphs, [graphKey]: reference } }
  await FS.mkdir(Path.dirname(lockPath))
  await writeDependencyLock(lockPath, updated, projectRoot)
  return updated
}

type SerializedDependencyLock = Omit<Types.DependencyLock, 'sources'> & {
  sources: Record<string, SerializedLockedSource>
}

type SerializedLockedSource = Types.LockedSource | Omit<Types.LockedSource, 'location'>

type BundledProjects = Types.BundledProjectDirectories | undefined

function relativizeLocations(lock: Types.DependencyLock, projectRoot: string): SerializedDependencyLock {
  return {
    ...lock,
    sources: Object.fromEntries(
      Object.entries(lock.sources).map(([identity, source]) => [
        identity,
        relativizeSource(source, projectRoot),
      ]),
    ),
  }
}

function relativizeSource(source: Types.LockedSource, projectRoot: string): SerializedLockedSource {
  if (source.provider === 'bundled') {
    return omitLocation(source)
  }
  const location = serializedLocation(source.location, projectRoot)
  return { ...source, location }
}

function omitLocation(source: Types.LockedSource): Omit<Types.LockedSource, 'location'> {
  const { location: _location, ...portable } = source
  return portable
}

function serializedLocation(location: string, projectRoot: string): string {
  return Path.isAbsolute(location)
    ? Path.relative(projectRoot, location).replaceAll('\\', '/')
    : location.replaceAll('\\', '/')
}

async function pruneMissingGraphReferences(
  lock: Types.DependencyLock,
  projectRoot: string,
): Promise<Types.DependencyLock> {
  const existingGraphs: NonNullable<Types.DependencyLock['npmGraphs']> = lock.npmGraphs ?? {}
  const npmGraphs = Objects.copy(existingGraphs)
  let changed = false
  for (const key of Object.keys(npmGraphs)) {
    if (!isOwnedSourceKey(key)) {
      continue
    }
    const sourcePath = Path.resolve(projectRoot, key)
    if (Path.isWithin(projectRoot, sourcePath) && !await FS.exists(sourcePath)) {
      delete npmGraphs[key]
      changed = true
    }
  }
  if (!changed) {
    return lock
  }
  const updated = { ...lock, npmGraphs }
  await writeDependencyLock(resolveDependencyLockPath(projectRoot), updated, projectRoot)
  return updated
}

async function retainedProfileIdentities(directory: string): Promise<Set<string> | undefined> {
  if (!await FS.exists(directory)) {
    return new Set()
  }
  const identities = new Set<string>()
  for (const profile of await FS.readdir(directory)) {
    const root = Path.join(directory, profile)
    if (await FS.exists(Path.join(root, '.tao-managed-building'))) {
      return undefined
    }
    const metadataPath = Path.join(root, '.tao-managed.json')
    const metadata = await Try.WithDefault(
      undefined,
      () => parseRetainedProfileMetadata(metadataPath),
    )
    const identity = readRetainedGraphFingerprint(metadata)
    if (!identity) {
      return undefined
    }
    identities.add(identity)
  }
  return identities
}

function materializeSource(
  source: Types.LockedSource,
  projectRoot: string,
  bundledProjects: BundledProjects,
): Types.LockedSource {
  const location = materializeSourceLocation(source, projectRoot, bundledProjects)
  return { ...source, location }
}

function materializeSourceLocation(
  source: Types.LockedSource,
  projectRoot: string,
  bundledProjects: BundledProjects,
): string {
  if (source.provider === 'bundled') {
    return requiredBundledLocation(source.identifier, bundledProjects)
  }
  return Path.resolve(projectRoot, source.location)
}

async function parseDependencyLockFile(path: string): Promise<unknown> {
  const contents = await FS.readFile(path, 'utf8')
  return Json.Parse(contents) as unknown
}

function serializeDependencyLock(lock: Types.DependencyLock, projectRoot: string): string {
  const portableLock = relativizeLocations(lock, projectRoot)
  return Json.Print(portableLock) + NewlineCharacter
}

async function parseRetainedProfileMetadata(path: string): Promise<unknown> {
  const contents = await FS.readFile(path, 'utf8')
  return Json.Parse(contents) as unknown
}

function readRetainedGraphFingerprint(metadata: unknown): string | undefined {
  const fingerprint = hasRetainedGraphFingerprint(metadata)
    ? metadata.graphFingerprint
    : undefined
  return typeof fingerprint === 'string' ? fingerprint : undefined
}

function hasRetainedGraphFingerprint(metadata: unknown): metadata is { graphFingerprint: unknown } {
  return metadata !== null && typeof metadata === 'object' && 'graphFingerprint' in metadata
}

function isRegularFile(path: string): boolean {
  return Try.WithDefault(false, () => FS.lstatSync(path).isFile())
}

function validateGraphReference(key: string, fingerprint: string, hash: string): void {
  UserInput.Require(!!isOwnedSourceKey(key), 'Managed dependency graph key must be a safe project-relative identifier.')
  UserInput.Require(
    !(!Regxs.Sha256HashRegx.test(fingerprint) || !Regxs.Sha256HashRegx.test(hash)),
    'Managed dependency graph fingerprint and lock hash must be SHA-256 values.',
  )
}

function relativizeProjectPath(projectRoot: string, filePath: string): string {
  const absolute = Path.resolve(filePath)
  UserInput.Require(
    !(absolute === Path.resolve(projectRoot) || !Path.isWithin(projectRoot, absolute)),
    'Managed dependency lock path must be inside the project.',
  )
  return Path.relative(Path.resolve(projectRoot), absolute).replaceAll('\\', '/')
}

function requiredBundledLocation(
  identifier: string,
  bundledProjects: BundledProjects,
): string {
  const location = bundledProjects?.[identifier]
  if (!location) {
    UserInput.Fail(`Bundled dependency ${identifier} is unavailable in this runtime.`)
  }
  return location
}
