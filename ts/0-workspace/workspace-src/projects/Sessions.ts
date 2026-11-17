import { Errors, NewlineCharacter, Regxs, Try, UserInput } from '@shared'
import { FileLock, FS, Path } from '@shared/os'
import * as Lifecycle from './Lifecycle'
import { deriveProjectLayout, type ProjectLayout } from './Projects'

/** ProjectSession holds a stable lock for the lifetime of its generated session state. */
export type ProjectSession = {
  id: string
  directory: string
  lockPath: string
  release(): void
}
/** acquireSession opens a named or internal CLI/Studio project session. */
export async function acquireSession(
  projectRoot: string,
  options: SessionOptions = {},
): Promise<ProjectSession> {
  const id = options.id ?? createInternalSessionId(options.kind ?? 'cli')
  if (options.id) {
    validateSessionId(id)
  }
  const layout = deriveProjectLayout(Path.resolve(projectRoot))
  const lifecycle = await Lifecycle.acquireProjectLifecycle(layout.root, 2_000)
  UserInput.Require(!!lifecycle, 'Project maintenance is active. Retry session startup when it finishes.')
  return await Try(async () => {
    const lock = await acquireSessionLock(layout, id)
    return await Try(() => prepareSession(id, layout, lock), {
      catch(error) {
        lock.release()
        return Errors.Throw(error)
      },
    })
  }, {
    finally: lifecycle.release,
  })
}

/** SessionOptions selects a public session ID or an internal CLI/Studio session. */
export type SessionOptions = { id?: string; kind?: SessionKind }

/** isProjectSessionId accepts public and internal project session directory names. */
export function isProjectSessionId(id: string): boolean {
  return id === '.cli' || id === '.studio' || isUserSessionId(id)
}

type SessionKind = 'cli' | 'studio'

function validateSessionId(id: string): void {
  if (!isUserSessionId(id)) {
    UserInput.Fail(`Invalid project session ID: ${id}`)
  }
}

function isUserSessionId(id: string): boolean {
  return Regxs.SessionIdRegx.test(id)
}

function createInternalSessionId(kind: SessionKind): string {
  return kind === 'cli' ? '.cli' : '.studio'
}

const SessionMarker = '{"format":1}' + NewlineCharacter
async function ensureSessionState(directory: string): Promise<void> {
  const marker = Path.join(directory, '.tao-session.json')
  const markerContents = await Try.WithDefault(undefined, () => FS.readFile(marker, 'utf8'))
  if (markerContents === SessionMarker) {
    return
  }
  for (const name of await FS.readdir(directory)) {
    const path = Path.join(directory, name)
    const symbolicLink = Try.WithDefault(false, () => FS.lstatSync(path).isSymbolicLink())
    await FS.rm(path, { recursive: !symbolicLink, force: true })
  }
  await FS.writeFile(marker, SessionMarker)
}

async function acquireSessionLock(layout: ProjectLayout, id: string): Promise<FileLock.FileLock> {
  await Lifecycle.ensureProjectDirectories(
    layout.cacheDirectory,
    layout.sessionsDirectory,
    layout.sessionLocksDirectory,
  )
  const lockPath = Path.join(layout.sessionLocksDirectory, `${id}.lock`)
  if (Lifecycle.pathExists(lockPath) && !Lifecycle.isRegularFile(lockPath)) {
    UserInput.Fail(`Project session lock is not a regular file: ${lockPath}`)
  }
  const lock = await FileLock.tryAcquire(lockPath)
  if (lock === undefined) {
    UserInput.Fail(`Project session is already active: ${id}`)
  }
  return lock
}

async function prepareSession(
  id: string,
  layout: ProjectLayout,
  lock: FileLock.FileLock,
): Promise<ProjectSession> {
  const directory = Path.join(layout.sessionsDirectory, id)
  await Lifecycle.ensureProjectDirectories(directory)
  await ensureSessionState(directory)
  await clearPreviousSidecarSnapshots(directory)
  return { id, directory, lockPath: Path.join(layout.sessionLocksDirectory, `${id}.lock`), release: lock.release }
}

async function clearPreviousSidecarSnapshots(directory: string): Promise<void> {
  const snapshots = Path.join(directory, 'foreign-views')
  if (!Lifecycle.pathExists(snapshots)) {
    return
  }
  if (!Lifecycle.isRealDirectory(snapshots)) {
    UserInput.Fail(`Project sidecar snapshot path is not a real directory: ${snapshots}`)
  }
  await FS.rm(snapshots, { recursive: true, force: true })
}
