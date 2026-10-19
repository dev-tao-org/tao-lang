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
): DependencyLock | undefined {
  return lock ? { ...lock, sources: materializeSources(lock.sources, projectRoot) } : undefined
}

/** materializeSources resolves each relative source location against its project root. */
export function materializeSources(
  sources: Record<string, LockedSource>,
  projectRoot: string,
): Record<string, LockedSource> {
  return Object.fromEntries(
    Object.entries(sources).map(([identity, source]) => [
      identity,
      { ...source, location: Path.resolve(projectRoot, source.location) },
    ]),
  )
}

function relativizeLocations(lock: DependencyLock, projectRoot: string): DependencyLock {
  return {
    ...lock,
    sources: Object.fromEntries(
      Object.entries(lock.sources).map(([identity, source]) => [
        identity,
        { ...source, location: Path.relative(projectRoot, source.location).replaceAll('\\', '/') },
      ]),
    ),
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
  const lock = materializeLocations(await readDependencyLock(lockPath), projectRoot)
    ?? { version: 1, roots: {}, sources: {} }
  const relativeLockPath = projectRelativePath(projectRoot, durableLockPath)
  const reference: ManagedGraphReference = { fingerprint, lockPath: relativeLockPath, lockHash }
  const updated: DependencyLock = { ...lock, npmGraphs: { ...lock.npmGraphs, [graphKey]: reference } }
  await FileSystem.mkdir(Path.dirname(lockPath), { recursive: true })
  await writeDependencyLock(lockPath, updated, projectRoot)
  return updated
}

function validateGraphReference(key: string, fingerprint: string, hash: string): void {
  if (!key || key.includes('\\') || key.startsWith('/') || key.split('/').includes('..')) {
    Errors.ThrowUserInput('Managed dependency graph key must be a safe project-relative identifier.')
  }
  if (!/^[a-f0-9]{64}$/i.test(fingerprint) || !/^[a-f0-9]{64}$/i.test(hash)) {
    Errors.ThrowUserInput('Managed dependency graph fingerprint and lock hash must be SHA-256 values.')
  }
}

function projectRelativePath(projectRoot: string, filePath: string): string {
  const absolute = Path.resolve(filePath)
  const relative = Path.relative(Path.resolve(projectRoot), absolute).replaceAll('\\', '/')
  if (!relative || relative === '..' || relative.startsWith('../') || Path.isAbsolute(relative)) {
    Errors.ThrowUserInput('Managed dependency lock path must be inside the project.')
  }
  return relative
}

function isDependencyLock(value: unknown): value is DependencyLock {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1) {
    return false
  }
  if (!('roots' in value) || !isStringRecord(value.roots)) {
    return false
  }
  if (!('sources' in value) || typeof value.sources !== 'object' || value.sources === null) {
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

function isGraphRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && Object.entries(value).every(([key, reference]) => {
      if (!key || key.includes('\\') || key.startsWith('/') || key.split('/').includes('..')) {
        return false
      }
      if (typeof reference !== 'object' || reference === null) {
        return false
      }
      return 'fingerprint' in reference && typeof reference.fingerprint === 'string'
        && /^[a-f0-9]{64}$/i.test(reference.fingerprint)
        && 'lockHash' in reference && typeof reference.lockHash === 'string'
        && /^[a-f0-9]{64}$/i.test(reference.lockHash)
        && 'lockPath' in reference && typeof reference.lockPath === 'string'
        && !Path.isAbsolute(reference.lockPath) && !reference.lockPath.includes('\\')
        && !reference.lockPath.split('/').includes('..')
    })
}

function isLockedSource(value: unknown): value is LockedSource {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return 'identity' in value && typeof value.identity === 'string'
    && 'provider' in value && ['github', 'file', 'bundled'].includes(String(value.provider))
    && 'identifier' in value && typeof value.identifier === 'string'
    && 'version' in value && typeof value.version === 'string'
    && 'location' in value && typeof value.location === 'string'
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
