import { Errors, Try } from '../universal/universal'
import * as Artifacts from './Artifacts'
import * as FileSystem from './FileSystem'
import * as Path from './Path'
import * as Platform from './Platform'

/** SessionLock is a process-independent operating-system lock handle. */
export type SessionLock = { release(): void; dispose(): void }

/** acquire takes a nonblocking kernel lock and returns undefined when another process holds it. */
export async function acquire(path: string): Promise<SessionLock | undefined> {
  const root = Artifacts.resolvePath('cache/native-locks')
  const pointerPath = Path.join(root, 'current.json')
  const pointer = await readLockPointer(root, pointerPath)
  const addonPath = Path.join(root, pointer.directory, 'build/Release/tao_os_locks.node')
  const bindingPath = await loadLockBinding(addonPath)
  const lock = bindingPath.acquire(path)
  if (!lock) {
    return undefined
  }
  let released = false
  const release = () => {
    if (!released) {
      released = true
      lock.release()
    }
  }
  return { release, dispose: release }
}

/** isSafeVersionName accepts only an addon identity and its optional immutable rebuild suffix. */
export function isSafeVersionName(identity: string, directory: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(identity)) {
    return false
  }
  if (directory === identity) {
    return true
  }
  const suffix = directory.startsWith(`${identity}-`) ? directory.slice(identity.length + 1) : ''
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(suffix)
}

async function readLockPointer(root: string, path: string): Promise<{ identity: string; directory: string }> {
  return await Try(async () => {
    const contents = await FileSystem.readFile(path, 'utf8')
    const value: unknown = Try(() => JSON.parse(contents), { catch: () => throwInvalidPointer(path) })
    if (typeof value !== 'object' || value === null || !('identity' in value) || !('directory' in value)) {
      throwInvalidPointer(path)
    }
    const pointer = value as { identity: unknown; directory: unknown }
    const directory = pointer.directory
    if (
      typeof pointer.identity !== 'string' || typeof directory !== 'string'
      || !isSafeVersionName(pointer.identity, directory)
    ) {
      throwInvalidPointer(path)
    }
    const versionRoot = Path.resolve(root, directory)
    if (!Path.isWithin(root, versionRoot) || Path.dirname(versionRoot) !== Path.resolve(root)) {
      throwInvalidPointer(path)
    }
    return { identity: pointer.identity, directory }
  }, {
    catch(error) {
      if (!isMissingAddon(error)) {
        Errors.Throw(error)
      }
      Errors.ThrowHostEnvironment(
        `Native session-lock support is not prepared. Run ./agent setup from the Tao repository before using sessions. (${path})`,
      )
    },
  })
}

function throwInvalidPointer(path: string): never {
  Errors.ThrowHostEnvironment(
    `Native session-lock pointer is invalid or outdated. Run ./agent setup to rebuild it. (${path})`,
  )
}

type NativeLock = { release(): void }

type LockBinding = { acquire(path: string): NativeLock | undefined }

async function loadLockBinding(path: string): Promise<LockBinding> {
  return await Try(() => Platform.loadModule(path), {
    catch(error) {
      if (!isMissingAddon(error)) {
        Errors.Throw(error)
      }
      Errors.ThrowHostEnvironment(
        `The prepared native session-lock addon is missing. Run ./agent setup to rebuild it. (${path})`,
      )
    },
  })
}

function isMissingAddon(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && ['ENOENT', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(String(error.code))
}
