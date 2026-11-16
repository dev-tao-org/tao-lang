import { Errors, Lists, Sort, Try } from '@shared'
import { FileLock, FS, Path } from '@shared/os'
import { readFileSourceRoots } from '../dependencies/LockFile'
import { cleanManagedModuleMetadata } from '../sidecars/ManagedModule/ManagedModules'
import * as Lifecycle from './Lifecycle'
import { deriveProjectLayout, type ProjectLayout } from './Projects'
import { isProjectSessionId } from './Sessions'

/** CleanResult reports removed project cache, active sessions, and retained shared project cache. */
export type CleanResult = { removed: string[]; skippedActive: string[]; sharedProtected: boolean; warnings: string[] }

/** cleanProject removes inactive session and generated project cache state. */
export async function cleanProject(root: string): Promise<CleanResult> {
  const layout = deriveProjectLayout(Path.resolve(root))
  if (!Lifecycle.isRealDirectory(layout.taoDirectory)) {
    return createEmptyCleanResult()
  }
  const lifecycle = await Lifecycle.acquireProjectLifecycle(layout.root)
  if (!lifecycle) {
    return { ...createEmptyCleanResult(), sharedProtected: true }
  }
  return await Try(() => cleanProjectUnderLifecycle(layout), { finally: lifecycle.release })
}

async function cleanProjectUnderLifecycle(layout: ProjectLayout): Promise<CleanResult> {
  const removed: string[] = []
  const skippedActive: string[] = []
  const warnings: string[] = []
  const cacheSafe = !Lifecycle.pathExists(layout.cacheDirectory) || Lifecycle.isRealDirectory(layout.cacheDirectory)
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
  layout: ProjectLayout,
  removed: string[],
): Promise<string[]> {
  const sessions = await listDirectoryNames(layout.sessionsDirectory)
  const locks = (await listDirectoryNames(layout.sessionLocksDirectory))
    .filter(name => name.endsWith('.lock'))
    .map(name => name.slice(0, -'.lock'.length))
  const skipped: string[] = []
  for (const id of Lists.unique(sessions, locks).sort(Sort.CompareStrings)) {
    if (isProjectSessionId(id) && await cleanSession(layout, id, removed)) {
      skipped.push(id)
    }
  }
  return skipped
}

async function cleanSession(
  layout: ProjectLayout,
  id: string,
  removed: string[],
): Promise<boolean> {
  const sessionPath = Path.join(layout.sessionsDirectory, id)
  const lockPath = Path.join(layout.sessionLocksDirectory, `${id}.lock`)
  if (isUnsafeSessionDirectory(sessionPath) || isUnsafeLockFile(lockPath)) {
    return true
  }
  const lock = await FileLock.tryAcquire(lockPath)
  if (!lock) {
    return true
  }
  await Try(async () => {
    if (Lifecycle.isRealDirectory(sessionPath)) {
      await FS.rm(sessionPath, { recursive: true, force: true })
      removed.push(id)
    }
  }, { finally: lock.release })
  return false
}

function createEmptyCleanResult(): CleanResult {
  return { removed: [], skippedActive: [], sharedProtected: false, warnings: [] }
}

function isUnsafeSessionDirectory(path: string): boolean {
  return Lifecycle.pathExists(path) && !Lifecycle.isRealDirectory(path)
}

function isUnsafeLockFile(path: string): boolean {
  return Lifecycle.pathExists(path) && !isRegularFile(path)
}

async function cleanProjectCache(cache: string, removed: string[]): Promise<void> {
  if (!Lifecycle.isRealDirectory(cache)) {
    return
  }
  for (const name of await listDirectoryNames(cache)) {
    if (name === 'sessions') {
      continue
    }
    await FS.rm(Path.join(cache, name), { recursive: true, force: true })
    removed.push(name)
  }
}

function isRegularFile(path: string): boolean {
  return Try.WithDefault(false, () => FS.lstatSync(path).isFile())
}

async function ensureLockDirectory(path: string): Promise<boolean> {
  const parent = Path.dirname(path)
  if (Lifecycle.pathExists(parent) && !Lifecycle.isRealDirectory(parent)) {
    return false
  }
  await FS.mkdir(path)
  return Lifecycle.isRealDirectory(path)
}

async function ensureSessionDirectory(path: string): Promise<boolean> {
  if (!Lifecycle.pathExists(path)) {
    return true
  }
  return Lifecycle.isRealDirectory(path)
}

async function listDirectoryNames(path: string): Promise<string[]> {
  if (!Lifecycle.isRealDirectory(path)) {
    return []
  }
  return await Try(() => FS.readdir(path), {
    catch: error => isMissing(error) ? [] : Errors.Throw(error),
  })
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === 'ENOENT'
}
