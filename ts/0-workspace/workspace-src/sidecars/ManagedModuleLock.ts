import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform, SessionLock } from '@shared/os'
import { findNearestProjectRoot } from '../modules/Paths'

/** withManagedModuleLock serializes publication and cleanup for one live module directory. */
export async function withManagedModuleLock<Value>(
  moduleDirectory: string,
  action: () => Promise<Value>,
): Promise<Value> {
  const canonicalDirectory = FileSystem.realpathSync(moduleDirectory)
  const ownerRoot = findNearestProjectRoot(canonicalDirectory)
  if (!ownerRoot) {
    Errors.ThrowUserInput(
      `Cannot lock managed module metadata outside a Tao project: ${canonicalDirectory}. Place the module in a project with a .tao directory.`,
    )
  }
  const lockDirectory = Path.join(ownerRoot, '.tao', 'locks')
  await FileSystem.mkdir(lockDirectory, { recursive: true })
  const lockPath = Path.join(lockDirectory, `module-${Platform.hashText(canonicalDirectory)}.lock`)
  const lock = await SessionLock.acquire(lockPath)
  if (!lock) {
    Errors.ThrowUserInput(
      `Managed module metadata is being updated or cleaned: ${moduleDirectory}. Retry after the other operation finishes.`,
    )
  }
  return await Try(action, { finally: () => lock.release() })
}
