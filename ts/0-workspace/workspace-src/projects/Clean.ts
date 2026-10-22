import { Errors, Try } from '@shared'
import { FileSystem, Path, SessionLock } from '@shared/os'
import { readFileSourceRoots } from '../dependencies/LockFile'
import { cleanManagedModuleMetadata } from '../sidecars/ManagedModules'
import {
  acquireProjectLifecycle,
  isRealDirectory,
  pathExists,
} from './Lifecycle'
import { deriveProjectLayout } from './Projects'
import { isProjectSessionId } from './Sessions'

/** CleanResult reports removed project cache, active sessions, and retained shared project cache. */
export type CleanResult = { removed: string[]; skippedActive: string[]; sharedProtected: boolean; warnings: string[] }

/** cleanProject removes inactive session and generated project cache state. */
export async function cleanProject(root: string): Promise<CleanResult> {
  const layout = deriveProjectLayout(Path.resolve(root))
  if (!isRealDirectory(layout.taoDirectory)) {
    return createEmptyCleanResult()
  }
  const lifecycle = await acquireProjectLifecycle(layout.root)
  if (!lifecycle) {
    return { ...createEmptyCleanResult(), sharedProtected: true }
  }
  return await Try(() => cleanProjectUnderLifecycle(layout), { finally: lifecycle.release })
}

async function cleanProjectUnderLifecycle(layout: ReturnType<typeof deriveProjectLayout>): Promise<CleanResult> {
  const removed: string[] = []
  const skippedActive: string[] = []
  const warnings: string[] = []
  const cacheSafe = !pathExists(layout.cacheDirectory) || isRealDirectory(layout.cacheDirectory)
  if (!cacheSafe) {
    return { removed, skippedActive, sharedProtected: true, warnings }
  }
  const lockDirectoryReady = await ensureLockDirectory(layout.sessionLocksDirectory)
  const sessionsDirectorySafe = await ensureSessionDirectory(layout.sessionsDirectory)
  if (!lockDirectoryReady || !sessionsDirectorySafe) {
    return { removed, skippedActive, sharedProtected: true, warnings }
  }
  skippedActive.push(...await cleanInactiveSessions(layout, removed))
  const sharedProtected = skippedActive.length > 0
  if (!sharedProtected) {
    warnings.push(...await cleanManagedModuleMetadata(layout.root, await readFileSourceRoots(layout.root)))
    await cleanProjectCache(layout.cacheDirectory, removed)
  }
  return { removed, skippedActive, sharedProtected, warnings }
}

async function cleanInactiveSessions(
  layout: ReturnType<typeof deriveProjectLayout>,
  removed: string[],
): Promise<string[]> {
  const sessions = await listDirectoryNames(layout.sessionsDirectory)
  const locks = (await listDirectoryNames(layout.sessionLocksDirectory))
    .filter(name => name.endsWith('.lock'))
    .map(name => name.slice(0, -'.lock'.length))
  const skipped: string[] = []
  for (const id of [...new Set([...sessions, ...locks])].sort()) {
    if (isProjectSessionId(id) && await cleanSession(layout, id, removed)) {
      skipped.push(id)
    }
  }
  return skipped
}

async function cleanSession(
  layout: ReturnType<typeof deriveProjectLayout>,
  id: string,
  removed: string[],
): Promise<boolean> {
  const sessionPath = Path.join(layout.sessionsDirectory, id)
  const lockPath = Path.join(layout.sessionLocksDirectory, `${id}.lock`)
  if (pathExists(sessionPath) && !isRealDirectory(sessionPath) || pathExists(lockPath) && !isRegularFile(lockPath)) {
    return true
  }
  const lock = await SessionLock.acquire(lockPath)
  if (!lock) {
    return true
  }
  await Try(async () => {
    if (isRealDirectory(sessionPath)) {
      await FileSystem.rm(sessionPath, { recursive: true, force: true })
      removed.push(id)
    }
  }, { finally: lock.release })
  return false
}

function createEmptyCleanResult(): CleanResult {
  return { removed: [], skippedActive: [], sharedProtected: false, warnings: [] }
}

async function cleanProjectCache(cache: string, removed: string[]): Promise<void> {
  if (!isRealDirectory(cache)) {
    return
  }
  for (const name of await listDirectoryNames(cache)) {
    if (name === 'sessions') {
      continue
    }
    await FileSystem.rm(Path.join(cache, name), { recursive: true, force: true })
    removed.push(name)
  }
}

function isRegularFile(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isFile())
}

async function ensureLockDirectory(path: string): Promise<boolean> {
  const parent = Path.dirname(path)
  if (pathExists(parent) && !isRealDirectory(parent)) {
    return false
  }
  await FileSystem.mkdir(path, { recursive: true })
  return isRealDirectory(path)
}

async function ensureSessionDirectory(path: string): Promise<boolean> {
  if (!pathExists(path)) {
    return true
  }
  return isRealDirectory(path)
}

async function listDirectoryNames(path: string): Promise<string[]> {
  if (!isRealDirectory(path)) {
    return []
  }
  return await Try(() => FileSystem.readdir(path), {
    catch: error => isMissing(error) ? [] : Errors.Throw(error),
  })
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
