import { Errors, Regxs, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { isDependencyLock, isOwnedSourceKey, isVersionOne } from './LockFileSchema'
import type { DependencyLock, LockedSource, ManagedGraphReference } from './Types'

/** resolveDependencyLockPath locates the project's durable source dependency graph. */
export function resolveDependencyLockPath(projectRoot: string): string {
  return Path.join(projectRoot, '.tao', 'store', 'dependencies.lock.json')
}

/** readDependencyLock reads a validated lock file without resolving or fetching sources. */
export async function readDependencyLock(path: string): Promise<DependencyLock | undefined> {
  if (!await FileSystem.exists(path)) {
    if (await FileSystem.exists(Path.join(Path.dirname(path), 'dependencies.initialized'))) {
      Errors.ThrowUserInput(`Dependency lock ${path} is missing; restore the exact durable lock from version control.`)
    }
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
    if (isVersionOne(parsed)) {
      Errors.ThrowUserInput(
        `Dependency lock ${path} uses unsupported format version 1; restore an updated version 2 lock without re-resolving pins.`,
      )
    }
    Errors.ThrowUserInput(
      `Dependency lock ${path} is invalid; restore it from version control or repair it explicitly.`,
    )
  }
  return parsed
}

/** materializeLocations turns project-relative lock paths into current machine paths. */
export function materializeLocations(
  lock: OptionalDependencyLock,
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
  const lock = await readDependencyLock(resolveDependencyLockPath(projectRoot))
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
    await FileSystem.rm(path.replace(Regxs.LockFileExtensionRegx, '.sha256'), { force: true })
  }
}

/** writeDependencyLock atomically replaces the lock file with stable formatted JSON. */
export async function writeDependencyLock(path: string, lock: DependencyLock, projectRoot: string): Promise<void> {
  const contents = JSON.stringify(relativizeLocations(lock, projectRoot), null, 2) + '\n'
  const temporary = `${path}.${Platform.randomUUID()}.tmp`
  await Try(async () => {
    await FileSystem.writeFile(temporary, contents)
    await FileSystem.rename(temporary, path)
    await FileSystem.writeFile(Path.join(Path.dirname(path), 'dependencies.initialized'), '1\n')
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
  const lockPath = resolveDependencyLockPath(projectRoot)
  const lock = await readDependencyLock(lockPath)
    ?? { version: 2, roots: {}, sources: {}, commitPins: {} }
  const relativeLockPath = relativizeProjectPath(projectRoot, durableLockPath)
  const reference: ManagedGraphReference = { fingerprint, lockPath: relativeLockPath, lockHash }
  const updated: DependencyLock = { ...lock, npmGraphs: { ...lock.npmGraphs, [graphKey]: reference } }
  await FileSystem.mkdir(Path.dirname(lockPath), { recursive: true })
  await writeDependencyLock(lockPath, updated, projectRoot)
  return updated
}

type SerializedDependencyLock = Omit<DependencyLock, 'sources'> & {
  sources: Record<string, SerializedLockedSource>
}

type SerializedLockedSource = LockedSource | Omit<LockedSource, 'location'>
type OptionalDependencyLock = DependencyLock | undefined
type BundledProjects = Readonly<Record<string, string>> | undefined

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
  await writeDependencyLock(resolveDependencyLockPath(projectRoot), updated, projectRoot)
  return updated
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
  if (!Regxs.Sha256HashRegx.test(fingerprint) || !Regxs.Sha256HashRegx.test(hash)) {
    Errors.ThrowUserInput('Managed dependency graph fingerprint and lock hash must be SHA-256 values.')
  }
}

function relativizeProjectPath(projectRoot: string, filePath: string): string {
  const absolute = Path.resolve(filePath)
  if (absolute === Path.resolve(projectRoot) || !Path.isWithin(projectRoot, absolute)) {
    Errors.ThrowUserInput('Managed dependency lock path must be inside the project.')
  }
  return Path.relative(Path.resolve(projectRoot), absolute).replaceAll('\\', '/')
}

function requiredBundledLocation(
  identifier: string,
  bundledProjects: BundledProjects,
): string {
  const location = bundledProjects?.[identifier]
  if (!location) {
    Errors.ThrowUserInput(`Bundled dependency ${identifier} is unavailable in this runtime.`)
  }
  return location
}
