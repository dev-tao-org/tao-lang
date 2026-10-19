import { Errors, Try } from '@shared'
import { FileSystem, Path, SessionLock } from '@shared/os'
import { cleanManagedModuleMetadata } from '../sidecars/ManagedModules'
import {
  acquireProjectLifecycle,
  isRealDirectory as isRealStateDirectory,
  pathExists as statePathExists,
} from './Lifecycle'
import { projectLayout } from './Projects'

/** cleanProject removes inactive session and generated project cache state. */
export async function cleanProject(root: string): Promise<CleanResult> {
  const layout = projectLayout(Path.resolve(root))
  if (!isRealStateDirectory(layout.taoDirectory)) {
    return emptyCleanResult()
  }
  const lifecycle = await acquireProjectLifecycle(layout.root)
  if (!lifecycle) {
    return { ...emptyCleanResult(), sharedProtected: true }
  }
  return await Try(() => cleanProjectUnderLifecycle(layout), { finally: lifecycle.release })
}

async function cleanProjectUnderLifecycle(layout: ReturnType<typeof projectLayout>): Promise<CleanResult> {
  const removed: string[] = []
  const skippedActive: string[] = []
  const lockDirectoryReady = await ensureLockDirectory(layout.sessionLocksDirectory)
  const sessionsDirectorySafe = await ensureSessionDirectory(layout.sessionsDirectory)
  if (!lockDirectoryReady || !sessionsDirectorySafe) {
    return { removed, skippedActive, sharedProtected: true }
  }
  const sessions = await directoryNames(layout.sessionsDirectory)
  const locks = (await directoryNames(layout.sessionLocksDirectory))
    .filter(name => name.endsWith('.lock'))
    .map(name => name.slice(0, -'.lock'.length))
  for (const id of [...new Set([...sessions, ...locks])].sort()) {
    if (!isSessionId(id)) {
      continue
    }
    const sessionPath = Path.join(layout.sessionsDirectory, id)
    if (statePathExists(sessionPath) && !isSessionDirectory(sessionPath)) {
      skippedActive.push(id)
      continue
    }
    const lockPath = Path.join(layout.sessionLocksDirectory, `${id}.lock`)
    if (statePathExists(lockPath) && !isRegularFile(lockPath)) {
      skippedActive.push(id)
      continue
    }
    const lock = await SessionLock.acquire(lockPath)
    if (!lock) {
      skippedActive.push(id)
      continue
    }
    await Try(async () => {
      if (isSessionDirectory(sessionPath)) {
        await FileSystem.rm(sessionPath, { recursive: true, force: true })
        removed.push(id)
      }
    }, { finally: lock.release })
  }
  const cacheSafe = !isPathPresent(layout.cacheDirectory) || isRealDirectory(layout.cacheDirectory)
  const sharedProtected = skippedActive.length > 0 || !cacheSafe
  if (!sharedProtected && cacheSafe) {
    await cleanManagedModuleMetadata(layout.root)
    await cleanProjectCache(layout.cacheDirectory, removed)
  }
  return { removed, skippedActive, sharedProtected }
}

function emptyCleanResult(): CleanResult {
  return { removed: [], skippedActive: [], sharedProtected: false }
}

/** CleanResult reports removed project cache, active sessions, and retained shared project cache. */
export type CleanResult = { removed: string[]; skippedActive: string[]; sharedProtected: boolean }

async function cleanProjectCache(cache: string, removed: string[]): Promise<void> {
  if (!isRealDirectory(cache)) {
    return
  }
  for (const name of await directoryNames(cache)) {
    if (name === 'sessions') {
      continue
    }
    await FileSystem.rm(Path.join(cache, name), { recursive: true, force: true })
    removed.push(name)
  }
}

function isSessionId(id: string): boolean {
  return id === '.cli' || id === '.studio' || /^[a-z0-9][a-z0-9_-]*$/.test(id)
}

function isSessionDirectory(path: string): boolean {
  return isRealDirectory(path)
}

function isRegularFile(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isFile())
}

function isPathPresent(path: string): boolean {
  return statePathExists(path)
}

function isRealDirectory(path: string): boolean {
  return isRealStateDirectory(path)
}

async function ensureLockDirectory(path: string): Promise<boolean> {
  const parent = Path.dirname(path)
  if (isPathPresent(parent) && !isRealDirectory(parent)) {
    return false
  }
  await FileSystem.mkdir(path, { recursive: true })
  return isRealDirectory(path)
}

async function ensureSessionDirectory(path: string): Promise<boolean> {
  if (!isPathPresent(path)) {
    return true
  }
  return isRealDirectory(path)
}

async function directoryNames(path: string): Promise<string[]> {
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
