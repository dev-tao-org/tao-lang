import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { cleanProject } from '../../workspace-src/projects/Clean'
import { acquireProjectLifecycle } from '../../workspace-src/projects/Lifecycle'
import { discoverProject, initializeProject } from '../../workspace-src/projects/Projects'
import { acquireSession, type ProjectSession } from '../../workspace-src/projects/Sessions'

type OptionalProjectSession = ProjectSession | undefined

Tests.test('named sessions contend, reuse warm state, and clean skips active sessions', async () => {
  const root = temporaryProject()
  let session: OptionalProjectSession
  await Try(async () => {
    await initializeProject(root)
    session = await acquireSession(root, { id: 'editor-1' })
    const state = Path.join(session.directory, 'warm-state.json')
    const sharedBuild = Path.join(root, '.tao', 'cache', 'build', 'output.js')
    const sidecarSnapshot = Path.join(session.directory, 'foreign-views', 'snapshot', 'source.tsx')
    const warmCompilerState = Path.join(session.directory, 'compiler-cache', 'state.json')
    const lockPath = session.lockPath
    await FS.mkdirs(Path.dirname(sharedBuild), Path.dirname(sidecarSnapshot), Path.dirname(warmCompilerState))
    await FS.writeFile(sharedBuild, 'generated')
    await FS.writeFile(sidecarSnapshot, 'old snapshot')
    await FS.writeFile(warmCompilerState, 'warm')
    await FS.writeFile(state, '{"ready":true}')
    await expectFailure(() => acquireSession(root, { id: 'editor-1' }))
    session.release()
    session = await acquireSession(root, { id: 'editor-1' })
    Tests.expect(await FS.readFile(state, 'utf8')).toBe('{"ready":true}')
    Tests.expect(await FS.exists(sidecarSnapshot)).toBe(false)
    Tests.expect(await FS.readFile(warmCompilerState, 'utf8')).toBe('warm')
    const whileActive = await cleanProject(root)
    Tests.expect(whileActive.skippedActive).toContain('editor-1')
    Tests.expect(whileActive.sharedProtected).toBe(true)
    Tests.expect(await FS.exists(sharedBuild)).toBe(true)
    session.release()
    session = undefined
    const cleaned = await cleanProject(root)
    Tests.expect(cleaned.removed).toContain('editor-1')
    Tests.expect(await FS.exists(state)).toBe(false)
    Tests.expect(await FS.exists(sharedBuild)).toBe(false)
    Tests.expect(await FS.exists(lockPath)).toBe(true)
    await recoverCorruptSession(root, state)
  }, {
    async finally() {
      session?.release()
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

async function recoverCorruptSession(root: string, state: string): Promise<void> {
  const reopened = await acquireSession(root, { id: 'editor-1' })
  Tests.expect(await FS.exists(reopened.directory)).toBe(true)
  await FS.writeFile(Path.join(reopened.directory, '.tao-session.json'), 'corrupt')
  await FS.writeFile(state, 'stale')
  const external = Artifacts.resolvePath('tmp', `tao-session-external-${Platform.randomUUID()}.txt`)
  await FS.writeFile(external, 'outside')
  await FS.symlink(external, Path.join(reopened.directory, 'outside-link'))
  reopened.release()
  const rebuilt = await acquireSession(root, { id: 'editor-1' })
  Tests.expect(await FS.exists(state)).toBe(false)
  Tests.expect(await FS.readFile(external, 'utf8')).toBe('outside')
  rebuilt.release()
  await FS.rm(external, { force: true })
}

Tests.test('cleanup protects shared state while the project lifecycle lock is held', async () => {
  const root = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const lifecycle = await acquireProjectLifecycle(root)
    Tests.expect(lifecycle).toBeDefined()
    await Try(async () => {
      const protectedClean = await cleanProject(root)
      Tests.expect(protectedClean.sharedProtected).toBe(true)
    }, { finally: () => lifecycle!.release() })
    const session = await acquireSession(root, { id: 'new-session' })
    session.release()
    const cleaned = await cleanProject(root)
    Tests.expect(cleaned.removed).toContain('new-session')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('different sessions both start during concurrent project opens', async () => {
  const root = temporaryProject()
  const sessions: ProjectSession[] = []
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
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('session startup refuses a symlinked generated session directory', async () => {
  const root = temporaryProject()
  const external = Artifacts.resolvePath('tmp', `tao-session-dir-${Platform.randomUUID()}`)
  await Try(async () => {
    const layout = await initializeProject(root)
    await FS.mkdirs(layout.sessionsDirectory, external)
    await FS.writeFile(Path.join(external, 'keep.txt'), 'outside')
    await FS.symlink(external, Path.join(layout.sessionsDirectory, 'named'))

    await expectFailure(() => acquireSession(root, { id: 'named' }))

    Tests.expect(await FS.readFile(Path.join(external, 'keep.txt'), 'utf8')).toBe('outside')
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(external, { recursive: true, force: true })
    },
  })
})

Tests.test('session startup refuses a symlinked sidecar snapshot root without following it', async () => {
  const root = temporaryProject()
  const external = Artifacts.resolvePath('tmp', `tao-session-snapshots-${Platform.randomUUID()}`)
  await Try(async () => {
    await initializeProject(root)
    const session = await acquireSession(root, { id: 'snapshot-link' })
    const externalFile = Path.join(external, 'keep.txt')
    await FS.mkdir(external)
    await FS.writeFile(externalFile, 'outside')
    session.release()
    await FS.symlink(external, Path.join(session.directory, 'foreign-views'))

    await expectFailure(() => acquireSession(root, { id: 'snapshot-link' }))

    Tests.expect(await FS.readFile(externalFile, 'utf8')).toBe('outside')
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(external, { recursive: true, force: true })
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
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('initialization rejects an ancestor project across a child Git boundary', async () => {
  const root = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const childGitRoot = Path.join(root, 'child')
    await FS.mkdir(Path.join(childGitRoot, '.git'))
    const nested = Path.join(childGitRoot, 'nested')

    await expectFailure(() => initializeProject(nested))
    Tests.expect(await discoverProject(nested)).toBeUndefined()
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('clean recreates a missing stable lock directory before reclaiming sessions', async () => {
  const root = temporaryProject()
  await Try(async () => {
    const layout = await initializeProject(root)
    const session = await acquireSession(root, { id: 'old-session' })
    session.release()
    await FS.rm(layout.sessionLocksDirectory, { recursive: true, force: true })

    const result = await cleanProject(root)

    Tests.expect(result.removed).toContain('old-session')
    Tests.expect(await FS.exists(session.lockPath)).toBe(true)
    Tests.expect(await FS.exists(session.directory)).toBe(false)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('project cleaning removes generated cache and retains durable store and dependency locks', async () => {
  const root = temporaryProject()
  const external = Artifacts.resolvePath('tmp', `tao-clean-external-${Platform.randomUUID()}`)
  await Try(async () => {
    const layout = await initializeProject(root)
    const store = Path.join(layout.taoDirectory, 'store', 'data.json')
    const dependencyLock = Path.join(layout.taoDirectory, 'store', 'dependencies.lock.json')
    const generated = Path.join(layout.cacheDirectory, 'build', 'output.js')
    const externalFile = Path.join(external, 'keep.txt')
    const externalLink = Path.join(layout.cacheDirectory, 'external')
    await FS.mkdirs(Path.dirname(store), Path.dirname(generated), external)
    await FS.writeFile(store, '{}')
    await FS.writeFile(dependencyLock, JSON.stringify({ version: 2, roots: {}, sources: {}, commitPins: {} }))
    await FS.writeFile(generated, 'generated')
    await FS.writeFile(externalFile, 'keep')
    await FS.symlink(external, externalLink)

    await cleanProject(root)

    Tests.expect(await FS.exists(store)).toBe(true)
    Tests.expect(await FS.exists(dependencyLock)).toBe(true)
    Tests.expect(await FS.exists(generated)).toBe(false)
    Tests.expect(await FS.exists(externalFile)).toBe(true)
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(external, { recursive: true, force: true })
    },
  })
})

Tests.test('clean protects sessions when the project cache path is a symlink', async () => {
  const root = temporaryProject()
  const external = Artifacts.resolvePath('tmp', `tao-clean-cache-${Platform.randomUUID()}`)
  await Try(async () => {
    const layout = await initializeProject(root)
    const session = await acquireSession(root, { id: 'preserve-me' })
    const externalSession = Path.join(external, 'sessions', 'preserve-me')
    await FS.mkdir(externalSession)
    await FS.writeFile(Path.join(externalSession, 'keep.txt'), 'outside')
    session.release()
    await FS.rm(layout.cacheDirectory, { recursive: true, force: true })
    await FS.symlink(external, layout.cacheDirectory)

    const result = await cleanProject(root)

    Tests.expect(result.sharedProtected).toBe(true)
    Tests.expect(await FS.readFile(Path.join(externalSession, 'keep.txt'), 'utf8')).toBe('outside')
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(external, { recursive: true, force: true })
    },
  })
})

Tests.test('clean removes managed metadata from a file dependency root', async () => {
  const root = temporaryProject()
  const dependency = Artifacts.resolvePath('tmp', `tao-clean-source-${Platform.randomUUID()}`)
  await Try(async () => {
    const packagePath = await createManagedFileDependency(root, dependency)

    await cleanProject(root)

    Tests.expect(await FS.exists(packagePath)).toBe(false)
    Tests.expect(await FS.exists(Path.join(Path.dirname(packagePath), '.tao-managed-module.json'))).toBe(false)
    Tests.expect(await FS.exists(Path.join(Path.dirname(packagePath), 'Source.tao'))).toBe(true)
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(dependency, { recursive: true, force: true })
    },
  })
})

async function createManagedFileDependency(root: string, dependency: string): Promise<string> {
  const layout = await initializeProject(root)
  const module = Path.join(dependency, 'module')
  const profile = Path.join(layout.cacheDirectory, 'managed-modules', 'fixture')
  const files = [[Path.join(module, 'package.json'), '{"private":true}' + NewlineCharacter], [
    Path.join(module, 'tsconfig.json'),
    '{"extends":"defaults.json"}' + NewlineCharacter,
  ]] as const
  await FS.mkdirs(Path.join(dependency, '.tao'), module, profile)
  await FS.writeFile(
    Path.join(profile, '.tao-managed.json'),
    JSON.stringify({ fingerprint: 'fixture', lockHash: 'fixture' }),
  )
  for (const [path, contents] of files) {
    await FS.writeFile(path, contents)
  }
  await writeModuleOwnership(module, files, profile)
  await FS.writeFile(Path.join(module, 'Source.tao'), 'view Source {}')
  await writeDependencyLock(layout.taoDirectory, root, dependency)
  return files[0][0]
}

async function writeModuleOwnership(
  module: string,
  files: readonly (readonly [string, string])[],
  profile: string,
): Promise<void> {
  await FS.writeFile(
    Path.join(module, '.tao-managed-module.json'),
    JSON.stringify({
      files: files.map(([path]) => path),
      generatedHashes: Object.fromEntries(files.map(([path, contents]) => [path, Platform.hashText(contents)])),
      packages: [],
      profile,
    }),
  )
}

async function writeDependencyLock(taoDirectory: string, root: string, dependency: string): Promise<void> {
  await FS.writeFile(
    Path.join(taoDirectory, 'store', 'dependencies.lock.json'),
    JSON.stringify({
      version: 2,
      roots: { dependency: 'dependency@1.0.0' },
      commitPins: {},
      sources: {
        dependency: {
          identity: 'dependency',
          provider: 'file',
          identifier: 'fixture',
          version: '1.0.0',
          location: Path.relative(root, dependency).replaceAll('\\', '/'),
          requirements: [],
        },
      },
    }),
  )
}

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
