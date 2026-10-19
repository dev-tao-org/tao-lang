import * as Artifacts from './Artifacts'
import * as FileSystem from './FileSystem'
import * as Path from './Path'
import * as Platform from './Platform'

/** SessionLock is a process-independent operating-system lock handle. */
export type SessionLock = { release(): void; dispose(): void }

/** acquire takes a nonblocking kernel lock and returns undefined when another process holds it. */
export async function acquire(path: string): Promise<SessionLock | undefined> {
  const root = Artifacts.resolvePath('cache/native-locks')
  const pointer = JSON.parse(await FileSystem.readFile(Path.join(root, 'current.json'), 'utf8')) as { identity: string }
  const addonPath = Path.join(root, pointer.identity, 'build/Release/tao_os_locks.node')
  const bindingPath = Platform.loadModule<{ acquire(path: string): { release(): void } | undefined }>(addonPath)
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
