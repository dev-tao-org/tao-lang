import { Errors, Switch, Time, Try } from '../../universal/universal'
import * as UserInput from '../../universal/UserInput'
import type { Dirent } from '../bridges/Bridge_node/Bridge_node'
import * as Node from '../bridges/Bridge_node/Bridge_node'
import { dirname, join, posix, readdir, win32 } from '../bridges/Bridge_node/Bridge_node'
import Env from '../Env'
import * as FS from '../FS'
import * as FileLock from '../locks/FileLock'
import * as Path from '../Path'
import * as Platform from '../Platform'

/** StorageRoots contains the user-owned Tao cache and support roots. */
export type StorageRoots = { cache: string; support: string }

/** StoragePlatform identifies a supported host path convention. */
export type StoragePlatform = 'macos' | 'linux' | 'windows'

/** resolveStorage derives Tao roots from explicit host inputs without reading or writing process state. */
export function resolveStorage(
  platform: StoragePlatform,
  home: string,
  environment: Record<string, EnvironmentValue>,
): StorageRoots {
  const pathApi = platform === 'windows' ? Node.win32 : Node.posix
  const bases = Switch<StoragePlatform, StorageRoots>(platform, {
    macos: () => ({
      cache: Node.posix.join(home, 'Library', 'Caches'),
      support: Node.posix.join(home, 'Library', 'Application Support'),
    }),
    windows() {
      const localAppData = environment.LOCALAPPDATA || Node.win32.join(home, 'AppData', 'Local')
      return {
        cache: Node.win32.join(localAppData, 'Tao', 'Cache'),
        support: Node.win32.join(localAppData, 'Tao', 'Support'),
      }
    },
    linux: () => ({
      cache: xdgPath(environment.XDG_CACHE_HOME, Node.posix.join(home, '.cache')),
      support: xdgPath(environment.XDG_DATA_HOME, Node.posix.join(home, '.local', 'share')),
    }),
  })
  const suffix = platform === 'windows' ? [] : ['Tao']
  return {
    cache: resolveOverride(environment.TAO_CACHE_DIR, bases.cache, suffix, home, pathApi),
    support: resolveOverride(environment.TAO_SUPPORT_DIR, bases.support, suffix, home, pathApi),
  }
}

/** resolveCacheDirectory resolves a path beneath Tao's cache root without creating it. */
export function resolveCacheDirectory(...segments: string[]): string {
  return resolveBelow(resolveStorageRoots().cache, segments)
}

/** resolveSupportDirectory resolves a path beneath Tao's durable support root without creating it. */
export function resolveSupportDirectory(...segments: string[]): string {
  return resolveBelow(resolveStorageRoots().support, segments)
}

/** withCacheMutation serializes shared-cache writers and cleanup across threads and processes. */
export async function withCacheMutation<Value>(operation: () => Promise<Value>): Promise<Value> {
  const path = resolveSupportDirectory('locks', 'cache-mutation.lock')
  await FS.mkdir(dirname(path))
  const releaseLocal = await acquireLocalMutation()
  return await Try(async () => {
    const lock = await acquireMutationLock(path)
    return await Try(operation, { finally: () => lock.release() })
  }, { finally: releaseLocal })
}

/** acquireCacheLease holds a removable lease probe; its lifecycle is serialized by the stable cache-mutation lock. */
export async function acquireCacheLease(identity: string): Promise<() => void | Promise<void>> {
  const path = resolveSupportDirectory('leases', `${Platform.hashText(identity)}.lock`)
  await FS.mkdir(dirname(path))
  let releaseLease!: () => Promise<void>
  await withCacheMutation(async () => {
    await hasBusyLease(resolveSupportDirectory('leases'))
    const lock = await FileLock.tryAcquire(path)
    if (!lock) {
      Errors.ThrowHostEnvironment(`Cache lease is already held for identity: ${identity}`)
    }
    activeLeases.add(path)
    releaseLease = () => releaseCacheLease(path, lock)
  })
  let release: PendingLeaseRelease
  return () => release ??= releaseLease()
}

/** cleanSharedCache removes Tao cache entries only when no consumer lease is active. */
export async function cleanSharedCache(report?: (reason: string) => void): Promise<boolean> {
  return await withCacheMutation(async () => {
    if (activeLeases.size > 0) {
      report?.(
        `Active cache consumer leases remain under ${
          resolveSupportDirectory('leases')
        }. Close their workspaces before retrying.`,
      )
      return false
    }
    const leases = resolveSupportDirectory('leases')
    if (await hasBusyLease(leases, report)) {
      return false
    }
    const root = await existingDirectory(resolveCacheDirectory())
    if (!root) {
      return true
    }
    await removeCacheEntries(root)
    return true
  })
}

type EnvironmentValue = string | undefined
type PendingLeaseRelease = Promise<void> | undefined
type StoragePathApi = typeof posix | typeof win32

function resolveStorageRoots(): StorageRoots {
  const system = Platform.systemInfo().os
  const current = resolveStoragePlatform(system)
  if (!current) {
    Errors.ThrowHostEnvironment(`Tao storage locations are not defined for this operating system: ${system}`)
  }
  return resolveStorage(current, Path.home(), Env.values())
}

function resolveStoragePlatform(system: string): StoragePlatform | undefined {
  if (!Platform.isSupportedHostSystem(system)) {
    return undefined
  }
  return Switch<Platform.HostSystem, StoragePlatform>(system, {
    Darwin: () => 'macos',
    Windows_NT: () => 'windows',
    Linux: () => 'linux',
  })
}

function resolveOverride(
  override: EnvironmentValue,
  base: string,
  suffix: string[],
  home: string,
  pathApi: StoragePathApi,
): string {
  const selected = override?.trim() || pathApi.join(base, ...suffix)
  return pathApi.isAbsolute(selected) ? pathApi.resolve(selected) : pathApi.resolve(home, selected)
}

function xdgPath(value: EnvironmentValue, fallback: string): string {
  return value && posix.isAbsolute(value) ? posix.resolve(value) : fallback
}

function resolveBelow(root: string, segments: readonly string[]): string {
  const result = Node.resolve(root, ...segments)
  if (!Path.isWithin(root, result)) {
    UserInput.Fail(`Storage path escapes its configured root: ${result}`)
  }
  return result
}

async function acquireMutationLock(path: string): Promise<FileLock.FileLock> {
  const deadline = Time.nowMs() + 120_000
  while (true) {
    const lock = await FileLock.tryAcquire(path)
    if (lock) {
      return lock
    }
    if (Time.nowMs() >= deadline) {
      Errors.ThrowHostEnvironment(`Cache mutation lock is still held: ${path}. Check for a stalled cache operation.`)
    }
    await Time.sleep(25)
  }
}

async function acquireLocalMutation(): Promise<() => void> {
  const previous = localMutations.get('cache') ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => release = resolve)
  const tail = previous.then(() => current)
  localMutations.set('cache', tail)
  await previous
  return () => {
    release()
    if (localMutations.get('cache') === tail) {
      localMutations.delete('cache')
    }
  }
}

async function releaseCacheLease(path: string, lock: FileLock.FileLock): Promise<void> {
  let released = false
  const release = () => {
    if (!released) {
      released = true
      activeLeases.delete(path)
      lock.release()
    }
  }
  await Try(() =>
    withCacheMutation(async () => {
      release()
      await removeLeaseProbe(path)
    }), { finally: release })
}

async function removeLeaseProbe(path: string, report?: (reason: string) => void): Promise<boolean> {
  return await Try(async () => {
    await Node.rm(path, { force: true })
    return true
  }, { catch: error => blockedProbe(error, path, report) ? false : Errors.Throw(error) })
}

function blockedProbe(error: unknown, path: string, report?: (reason: string) => void): boolean {
  if (!isUnavailableProbe(error)) {
    return false
  }
  const code = String((error as { code: unknown }).code)
  report?.(
    `Cannot inspect or remove cache lease ${path} (${code}). Resolve its file access or sharing restriction, then retry tao clean --wipe.`,
  )
  return true
}

function isUnavailableProbe(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && ['EPERM', 'EACCES', 'EBUSY'].includes(String(error.code))
}

async function hasBusyLease(directory: string, report?: (reason: string) => void): Promise<boolean> {
  const entries = await readLeaseDirectory(directory, report)
  if (!entries) {
    return true
  }
  let busy = false
  for (const entry of entries.filter(item => item.name.endsWith('.lock'))) {
    const entryIsBusy = await checkLeaseEntry(directory, entry, report)
    // Check every probe even after finding a busy one, so stale probes still get cleaned up.
    busy = entryIsBusy || busy
  }
  return busy
}

async function readLeaseDirectory(directory: string, report?: (reason: string) => void): Promise<Dirent[] | undefined> {
  return await Try(() => readdir(directory, { withFileTypes: true }), {
    catch: error => handleLeaseDirectoryFailure(error, directory, report),
  })
}

async function checkLeaseEntry(directory: string, entry: Dirent, report?: (reason: string) => void): Promise<boolean> {
  const path = join(directory, entry.name)
  if (!entry.isFile()) {
    report?.(`Unexpected lease entry at ${path}. Inspect it before retrying tao clean --wipe.`)
    return true
  }
  const lock = await Try(() => FileLock.tryAcquire(path), {
    catch: error => blockedProbe(error, path, report) ? undefined : Errors.Throw(error),
  })
  if (!lock) {
    report?.(
      `Shared cache lease could not be cleared: ${path}. Close its owner or resolve the access issue above before retrying.`,
    )
    return true
  }
  lock.release()
  return !await removeLeaseProbe(path, report)
}

function handleLeaseDirectoryFailure(
  error: unknown,
  directory: string,
  report?: (reason: string) => void,
): never[] | undefined {
  if (isMissing(error)) {
    return []
  }
  if (blockedProbe(error, directory, report)) {
    return undefined
  }
  return Errors.Throw(error)
}

async function existingDirectory(path: string): Promise<string | undefined> {
  return await Try(async () => {
    const info = await Node.lstat(path)
    if (!info.isDirectory() && !info.isSymbolicLink()) {
      Errors.ThrowHostEnvironment(`Configured cache root is not a directory: ${path}`)
    }
    return await Node.realpath(path)
  }, { catch: error => isMissing(error) ? undefined : Errors.Throw(error) })
}

async function removeCacheEntries(root: string): Promise<void> {
  const entries = await Node.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'native-locks') {
      continue
    }
    await Node.rm(Node.join(root, entry.name), { recursive: true, force: true })
  }
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === 'ENOENT'
}

const activeLeases = new Set<string>()
const localMutations = new Map<string, Promise<void>>()
