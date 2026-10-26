import { Errors, Switch, Time, Try } from '../universal/universal'
import * as Env from './Env'
import { dirname, join, lstat, mkdir, posix, readdir, realpath, resolve, rm, win32 } from './NodeBuiltins'
import * as Path from './Path'
import * as Platform from './Platform'
import * as SessionLock from './SessionLock'

/** StorageRoots contains the user-owned Tao cache and support roots. */
export type StorageRoots = { cache: string; support: string }

/** StoragePlatform identifies a supported host path convention. */
export type StoragePlatform = 'macos' | 'linux' | 'windows'

/** resolveStorage derives Tao roots from explicit host inputs without reading or writing process state. */
export function resolveStorage(
  platform: StoragePlatform,
  home: string,
  environment: Record<string, string | undefined>,
): StorageRoots {
  const pathApi = platform === 'windows' ? win32 : posix
  const bases = Switch<StoragePlatform, StorageRoots>(platform, {
    macos: () => ({
      cache: posix.join(home, 'Library', 'Caches'),
      support: posix.join(home, 'Library', 'Application Support'),
    }),
    windows() {
      const localAppData = environment.LOCALAPPDATA || win32.join(home, 'AppData', 'Local')
      return { cache: win32.join(localAppData, 'Tao', 'Cache'), support: win32.join(localAppData, 'Tao', 'Support') }
    },
    linux: () => ({
      cache: xdgPath(environment.XDG_CACHE_HOME, posix.join(home, '.cache')),
      support: xdgPath(environment.XDG_DATA_HOME, posix.join(home, '.local', 'share')),
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
  await mkdir(dirname(path), { recursive: true })
  const releaseLocal = await acquireLocalMutation()
  return await Try(async () => {
    const lock = await acquireMutationLock(path)
    return await Try(operation, { finally: () => lock.release() })
  }, { finally: releaseLocal })
}

/** acquireCacheLease holds a removable lease probe; its lifecycle is serialized by the stable cache-mutation lock. */
export async function acquireCacheLease(identity: string): Promise<() => void | Promise<void>> {
  const path = resolveSupportDirectory('leases', `${Platform.hashText(identity)}.lock`)
  await mkdir(dirname(path), { recursive: true })
  let releaseLease!: () => Promise<void>
  await withCacheMutation(async () => {
    await hasBusyLease(resolveSupportDirectory('leases'))
    const lock = await SessionLock.acquire(path)
    if (!lock) {
      Errors.ThrowHostEnvironment(`Cache lease is already held for identity: ${identity}`)
    }
    activeLeases.add(path)
    releaseLease = () => releaseCacheLease(path, lock)
  })
  let release: Promise<void> | undefined
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

function resolveStorageRoots(): StorageRoots {
  const system = Platform.systemInfo().os
  const current = storagePlatform(system)
  if (!current) {
    Errors.ThrowHostEnvironment(`Tao storage locations are not defined for this operating system: ${system}`)
  }
  return resolveStorage(current, Platform.homeDirectory(), Env.snapshot())
}

function storagePlatform(system: string): StoragePlatform | undefined {
  if (system === 'Darwin') {
    return 'macos'
  }
  if (system === 'Windows_NT') {
    return 'windows'
  }
  if (system === 'Linux') {
    return 'linux'
  }
  return undefined
}

function resolveOverride(
  override: string | undefined,
  base: string,
  suffix: string[],
  home: string,
  pathApi: typeof posix | typeof win32,
): string {
  const selected = override?.trim() || pathApi.join(base, ...suffix)
  return pathApi.isAbsolute(selected) ? pathApi.resolve(selected) : pathApi.resolve(home, selected)
}

function xdgPath(value: string | undefined, fallback: string): string {
  return value && posix.isAbsolute(value) ? posix.resolve(value) : fallback
}

function resolveBelow(root: string, segments: readonly string[]): string {
  const result = resolve(root, ...segments)
  if (!Path.isWithin(root, result)) {
    Errors.ThrowUserInput(`Storage path escapes its configured root: ${result}`)
  }
  return result
}

async function acquireMutationLock(path: string): Promise<SessionLock.SessionLock> {
  const deadline = Time.nowMs() + 120_000
  while (true) {
    const lock = await SessionLock.acquire(path)
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

async function releaseCacheLease(path: string, lock: SessionLock.SessionLock): Promise<void> {
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
    await rm(path, { force: true })
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
  return typeof error === 'object' && error !== null && 'code' in error
    && ['EPERM', 'EACCES', 'EBUSY'].includes(String(error.code))
}

async function hasBusyLease(directory: string, report?: (reason: string) => void): Promise<boolean> {
  const entries = await Try(async () => await readdir(directory, { withFileTypes: true }), {
    catch: error => handleLeaseDirectoryFailure(error, directory, report),
  })
  if (!entries) {
    return true
  }
  let busy = false
  for (const entry of entries.filter(item => item.name.endsWith('.lock'))) {
    if (!entry.isFile()) {
      report?.(`Unexpected lease entry at ${join(directory, entry.name)}. Inspect it before retrying tao clean --wipe.`)
      busy = true
      continue
    }
    const path = join(directory, entry.name)
    const lock = await Try(() => SessionLock.acquire(path), {
      catch: error => blockedProbe(error, path, report) ? undefined : Errors.Throw(error),
    })
    if (!lock) {
      report?.(
        `Shared cache lease could not be cleared: ${path}. Close its owner or resolve the access issue above before retrying.`,
      )
      busy = true
      continue
    }
    lock.release()
    if (!await removeLeaseProbe(path, report)) {
      busy = true
    }
  }
  return busy
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
    const info = await lstat(path)
    if (!info.isDirectory() && !info.isSymbolicLink()) {
      Errors.ThrowHostEnvironment(`Configured cache root is not a directory: ${path}`)
    }
    return await realpath(path)
  }, { catch: error => isMissing(error) ? undefined : Errors.Throw(error) })
}

async function removeCacheEntries(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'native-locks') {
      continue
    }
    await rm(join(root, entry.name), { recursive: true, force: true })
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

const activeLeases = new Set<string>()
const localMutations = new Map<string, Promise<void>>()
