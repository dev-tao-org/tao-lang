import { Try, UserInput } from '@shared'
import { FileLock, FS, Path, Platform } from '@shared/os'
import { findNearestProjectRoot } from '../../modules/Paths'

/** withManagedModuleLock serializes publication and cleanup for one live module directory. */
export async function withManagedModuleLock<Value>(
  moduleDirectory: string,
  action: () => Promise<Value>,
): Promise<Value> {
  const canonicalDirectory = FS.realpathSync(moduleDirectory)
  const ownerRoot = findNearestProjectRoot(canonicalDirectory)
  if (!ownerRoot) {
    UserInput.Fail(
      `Cannot lock managed module metadata outside a Tao project: ${canonicalDirectory}. Place the module in a project with a .tao directory.`,
    )
  }
  const lockDirectory = Path.join(ownerRoot, '.tao', 'locks')
  await FS.mkdir(lockDirectory)
  const lockPath = Path.join(lockDirectory, `module-${Platform.hashText(canonicalDirectory)}.lock`)
  const lock = await FileLock.tryAcquire(lockPath)
  if (!lock) {
    UserInput.Fail(
      `Managed module metadata is being updated or cleaned: ${moduleDirectory}. Retry after the other operation finishes.`,
    )
  }
  return await Try(action, { finally: () => lock.release() })
}
