import { Time, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { cleanProject } from '../../workspace-src/projects/Clean'
import { acquireProjectLifecycle } from '../../workspace-src/projects/Lifecycle'
import { discoverProject, ensureProjectMetadata, initializeProject } from '../../workspace-src/projects/Projects'
import { acquireSession } from '../../workspace-src/projects/Sessions'

Tests.test('project metadata initializes at a boundary and discovery walks upward', async () => {
  const root = temporaryProject()
  await Try(async () => {
    const layout = await initializeProject(root)
    const identity = await FileSystem.readFile(Path.join(layout.taoDirectory, 'store', 'project.json'), 'utf8')
    await ensureProjectMetadata(root)
    Tests.expect(await FileSystem.readFile(Path.join(layout.taoDirectory, 'store', 'project.json'), 'utf8')).toBe(
      identity,
    )
    await FileSystem.mkdir(Path.join(root, 'src'), { recursive: true })
    Tests.expect(await discoverProject(Path.join(root, 'src', 'Main.tao'))).toEqual(layout)
    Tests.expect(await FileSystem.readFile(Path.join(root, '.tao', '.gitignore'), 'utf8')).toBe('cache/\nlocks/\n')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('named sessions contend, reuse warm state, and clean skips active sessions', async () => {
  const root = temporaryProject()
  let session: Awaited<ReturnType<typeof acquireSession>> | undefined
  await Try(async () => {
    await initializeProject(root)
    session = await acquireSession(root, { id: 'editor-1' })
    const state = Path.join(session.directory, 'warm-state.json')
    const sharedBuild = Path.join(root, '.tao', 'cache', 'build', 'output.js')
    const lockPath = session.lockPath
    await FileSystem.mkdir(Path.dirname(sharedBuild), { recursive: true })
    await FileSystem.writeFile(sharedBuild, 'generated')
    await FileSystem.writeFile(state, '{"ready":true}')
    await expectFailure(() => acquireSession(root, { id: 'editor-1' }))
    session.release()
    session = await acquireSession(root, { id: 'editor-1' })
    Tests.expect(await FileSystem.readFile(state, 'utf8')).toBe('{"ready":true}')
    const whileActive = await cleanProject(root)
    Tests.expect(whileActive.skippedActive).toContain('editor-1')
    Tests.expect(whileActive.sharedProtected).toBe(true)
    Tests.expect(await FileSystem.exists(sharedBuild)).toBe(true)
    session.release()
    session = undefined
    const cleaned = await cleanProject(root)
    Tests.expect(cleaned.removed).toContain('editor-1')
    Tests.expect(await FileSystem.exists(state)).toBe(false)
    Tests.expect(await FileSystem.exists(sharedBuild)).toBe(false)
    Tests.expect(await FileSystem.exists(lockPath)).toBe(true)
    const reopened = await acquireSession(root, { id: 'editor-1' })
    Tests.expect(await FileSystem.exists(reopened.directory)).toBe(true)
    await FileSystem.writeFile(Path.join(reopened.directory, '.tao-session.json'), 'corrupt')
    await FileSystem.writeFile(state, 'stale')
    const external = Artifacts.resolvePath('tmp', `tao-session-external-${Platform.randomUUID()}.txt`)
    await FileSystem.writeFile(external, 'outside')
    await FileSystem.symlink(external, Path.join(reopened.directory, 'outside-link'))
    reopened.release()
    const rebuilt = await acquireSession(root, { id: 'editor-1' })
    Tests.expect(await FileSystem.exists(state)).toBe(false)
    Tests.expect(await FileSystem.readFile(external, 'utf8')).toBe('outside')
    rebuilt.release()
    await FileSystem.rm(external, { force: true })
  }, {
    async finally() {
      session?.release()
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('session startup and cleanup contend on the project lifecycle lock', async () => {
  const root = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const lifecycle = await acquireProjectLifecycle(root)
    Tests.expect(lifecycle).toBeDefined()
    const protectedClean = await cleanProject(root)
    Tests.expect(protectedClean.sharedProtected).toBe(true)
    const starting = acquireSession(root, { id: 'new-session' })
    await Time.sleep(30)
    lifecycle!.release()
    const session = await starting
    session.release()
    const cleaned = await cleanProject(root)
    Tests.expect(cleaned.removed).toContain('new-session')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('different sessions both start during concurrent project opens', async () => {
  const root = temporaryProject()
  const sessions: Awaited<ReturnType<typeof acquireSession>>[] = []
  await Try(async () => {
    await initializeProject(root)
    sessions.push(
      ...await Promise.all([
        acquireSession(root, { id: 'editor-a' }),
        acquireSession(root, { id: 'editor-b' }),
      ]),
    )
    Tests.expect(sessions.map(session => session.id)).toEqual(['editor-a', 'editor-b'])
    Tests.expect(sessions[0]!.directory).not.toBe(sessions[1]!.directory)
  }, {
    async finally() {
      sessions.forEach(session => session.release())
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('session startup refuses a symlinked generated session directory', async () => {
  const root = temporaryProject()
  const external = Artifacts.resolvePath('tmp', `tao-session-dir-${Platform.randomUUID()}`)
  await Try(async () => {
    const layout = await initializeProject(root)
    await FileSystem.mkdir(layout.sessionsDirectory, { recursive: true })
    await FileSystem.mkdir(external, { recursive: true })
    await FileSystem.writeFile(Path.join(external, 'keep.txt'), 'outside')
    await FileSystem.symlink(external, Path.join(layout.sessionsDirectory, 'named'))

    await expectFailure(() => acquireSession(root, { id: 'named' }))

    Tests.expect(await FileSystem.readFile(Path.join(external, 'keep.txt'), 'utf8')).toBe('outside')
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(external, { recursive: true, force: true })
    },
  })
})

Tests.test('session identifiers reject paths and reserved project ancestors', async () => {
  const root = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    await expectFailure(() => initializeProject(root))
    await expectFailure(() => acquireSession(root, { id: '../escape' }))
    await expectFailure(() => initializeProject(Path.join(root, 'child')))
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('initialization rejects an ancestor project across a child Git boundary', async () => {
  const root = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const childGitRoot = Path.join(root, 'child')
    await FileSystem.mkdir(Path.join(childGitRoot, '.git'), { recursive: true })
    const nested = Path.join(childGitRoot, 'nested')

    await expectFailure(() => initializeProject(nested))
    Tests.expect(await discoverProject(nested)).toBeUndefined()
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('initialization canonicalizes symlinked target ancestors before checking project parents', async () => {
  const root = temporaryProject()
  const aliases = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const child = Path.join(root, 'child')
    await FileSystem.mkdir(child, { recursive: true })
    await FileSystem.mkdir(aliases, { recursive: true })
    await FileSystem.symlink(child, Path.join(aliases, 'alias'))

    await expectFailure(() => initializeProject(Path.join(aliases, 'alias', 'nested')))
    Tests.expect(await FileSystem.exists(Path.join(child, 'nested', '.tao'))).toBe(false)
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(aliases, { recursive: true, force: true })
    },
  })
})

Tests.test('project initialization skips nested markers reached only through directory symlinks', async () => {
  const root = temporaryProject()
  const external = temporaryProject()
  await Try(async () => {
    await FileSystem.mkdir(Path.join(external, '.tao'), { recursive: true })
    await FileSystem.mkdir(root, { recursive: true })
    await FileSystem.symlink(external, Path.join(root, 'linked'))
    Tests.expect((await initializeProject(root)).root).toBe(root)
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(external, { recursive: true, force: true })
    },
  })
})

Tests.test('clean recreates a missing stable lock directory before reclaiming sessions', async () => {
  const root = temporaryProject()
  await Try(async () => {
    const layout = await initializeProject(root)
    const session = await acquireSession(root, { id: 'old-session' })
    session.release()
    await FileSystem.rm(layout.sessionLocksDirectory, { recursive: true, force: true })

    const result = await cleanProject(root)

    Tests.expect(result.removed).toContain('old-session')
    Tests.expect(await FileSystem.exists(session.lockPath)).toBe(true)
    Tests.expect(await FileSystem.exists(session.directory)).toBe(false)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('project cleaning removes generated cache and retains durable store and dependency locks', async () => {
  const root = temporaryProject()
  const external = Artifacts.resolvePath('tmp', `tao-clean-external-${Platform.randomUUID()}`)
  await Try(async () => {
    const layout = await initializeProject(root)
    const store = Path.join(layout.taoDirectory, 'store', 'data.json')
    const dependencyLock = Path.join(layout.taoDirectory, 'dependencies.lock.json')
    const generated = Path.join(layout.cacheDirectory, 'build', 'output.js')
    const externalFile = Path.join(external, 'keep.txt')
    const externalLink = Path.join(layout.cacheDirectory, 'external')
    await FileSystem.mkdir(Path.dirname(store), { recursive: true })
    await FileSystem.mkdir(Path.dirname(generated), { recursive: true })
    await FileSystem.mkdir(external, { recursive: true })
    await FileSystem.writeFile(store, '{}')
    await FileSystem.writeFile(dependencyLock, '{}')
    await FileSystem.writeFile(generated, 'generated')
    await FileSystem.writeFile(externalFile, 'keep')
    await FileSystem.symlink(external, externalLink)

    await cleanProject(root)

    Tests.expect(await FileSystem.exists(store)).toBe(true)
    Tests.expect(await FileSystem.exists(dependencyLock)).toBe(true)
    Tests.expect(await FileSystem.exists(generated)).toBe(false)
    Tests.expect(await FileSystem.exists(externalFile)).toBe(true)
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(external, { recursive: true, force: true })
    },
  })
})

function temporaryProject(): string {
  return Artifacts.resolvePath('tmp', `tao-project-${Platform.randomUUID()}`)
}

async function expectFailure(operation: () => Promise<unknown>): Promise<void> {
  const failed = await Try(async () => {
    await operation()
    return false
  }, { catch: () => true })
  Tests.expect(failed).toBe(true)
}
