import { Errors, Time, Try } from '@shared'
import { FileSystem, Path, SessionLock } from '@shared/os'
import { projectLayout } from './Projects'

/** acquireProjectLifecycle serializes session startup with project cleanup. */
export async function acquireProjectLifecycle(
  root: string,
  waitMs = 0,
): Promise<Awaited<ReturnType<typeof SessionLock.acquire>>> {
  const layout = projectLayout(Path.resolve(root))
  requireRealDirectory(layout.taoDirectory, 'Tao project metadata')
  const locksRoot = Path.join(layout.taoDirectory, 'locks')
  ensureDirectoryParent(layout.taoDirectory, locksRoot)
  await FileSystem.mkdir(locksRoot, { recursive: true })
  requireRealDirectory(locksRoot, 'project lock directory')
  const lockPath = Path.join(locksRoot, 'lifecycle.lock')
  ensureRegularLockPath(lockPath)
  return await acquireLifecycleLock(lockPath, waitMs)
}

/** ensureProjectDirectory creates a directory only when no symlink occupies its path. */
export async function ensureProjectDirectory(path: string): Promise<void> {
  if (pathExists(path) && !isRealDirectory(path)) {
    Errors.ThrowUserInput(`Project state directory is not a real directory: ${path}`)
  }
  await FileSystem.mkdir(path, { recursive: true })
  requireRealDirectory(path, 'project state directory')
}

/** isRealDirectory reports a real directory without following a symlink. */
export function isRealDirectory(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isDirectory())
}

/** pathExists checks a path entry without following symbolic links. */
export function pathExists(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path) !== undefined)
}

/** isRegularFile reports a non-symlink regular file. */
export function isRegularFile(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isFile())
}

function requireRealDirectory(path: string, description: string): void {
  if (!isRealDirectory(path)) {
    Errors.ThrowUserInput(`${description} is not a real directory: ${path}`)
  }
}

function ensureDirectoryParent(parent: string, child: string): void {
  if (!isRealDirectory(parent) || pathExists(child) && !isRealDirectory(child)) {
    Errors.ThrowUserInput(`Project lock path is not a real directory: ${child}`)
  }
}

function ensureRegularLockPath(path: string): void {
  if (pathExists(path) && !isRegularFile(path)) {
    Errors.ThrowUserInput(`Project lifecycle lock is not a regular file: ${path}`)
  }
}

async function acquireLifecycleLock(lockPath: string, waitMs: number) {
  const deadline = Time.nowMs() + waitMs
  while (true) {
    const lock = await SessionLock.acquire(lockPath)
    if (lock || Time.nowMs() >= deadline) {
      return lock
    }
    await Time.sleep(Math.max(0, Math.min(25, deadline - Time.nowMs())))
  }
}
