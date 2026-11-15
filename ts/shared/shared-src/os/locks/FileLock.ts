import { Json, Schema } from '@shared'
import { Errors, Regxs, Try } from '../../universal/universal'
import * as FS from '../FS'
import * as Path from '../Path'
import * as Platform from '../Platform'
import * as Artifacts from '../Storage/Artifacts'

/** FileLock holds a path-based operating-system lock until release or process exit. */
export type FileLock = { release(): void; dispose(): void }

/** tryAcquire takes a nonblocking kernel lock and returns undefined when another process holds it. */
export async function tryAcquire(path: string): Promise<FileLock | undefined> {
  const root = Artifacts.resolvePath('cache/native-locks')
  const pointerPath = Path.join(root, 'current.json')
  const pointer = await readLockPointer(root, pointerPath)
  const addonPath = Path.join(root, pointer.directory, 'build/Release/tao_os_locks.node')
  const lockBinding = await loadLockBinding(addonPath)
  const lock = lockBinding.acquire(path)
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
  if (!Regxs.LowercaseSha256HashRegx.test(identity)) {
    return false
  }
  if (directory === identity) {
    return true
  }
  const suffix = directory.startsWith(`${identity}-`) ? directory.slice(identity.length + 1) : ''
  return Regxs.UuidRegx.test(suffix)
}

type LockPointer = { identity: string; directory: string }
const LockPointerSchema = Schema.object({ identity: Schema.string(), directory: Schema.string() })

async function readLockPointer(root: string, path: string): Promise<LockPointer> {
  return await Try(async () => {
    const contents = await FS.readFile(path, 'utf8')
    const value = parseLockPointer(path, contents)
    const pointer = value
    if (!hasSafePointerVersion(pointer)) {
      throwInvalidPointer(path)
    }
    const directory = pointer.directory
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
        `Native file-lock support is not prepared. Run ./agent unsandboxed setup from the Tao repository before acquiring locks. (${path})`,
      )
    },
  })
}

function parseLockPointer(path: string, contents: string): LockPointer {
  return Try(() => Json.Parse(contents, { schema: LockPointerSchema, sourceName: path }), {
    catch: () => throwInvalidPointer(path),
  })
}

function hasSafePointerVersion(pointer: { identity: unknown; directory: unknown }): pointer is {
  identity: LockPointer['identity']
  directory: LockPointer['directory']
} {
  return typeof pointer.identity === 'string' && typeof pointer.directory === 'string'
    && isSafeVersionName(pointer.identity, pointer.directory)
}

function throwInvalidPointer(path: string): never {
  Errors.ThrowHostEnvironment(
    `Native file-lock pointer is invalid or outdated. Run ./agent unsandboxed setup to rebuild it. (${path})`,
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
        `The prepared native file-lock addon is missing. Run ./agent unsandboxed setup to rebuild it. (${path})`,
      )
    },
  })
}

function isMissingAddon(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && ['ENOENT', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(String(error.code))
}
