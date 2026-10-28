import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import * as LockFile from '../../workspace-src/dependencies/LockFile'
import * as Store from '../../workspace-src/dependencies/Store'
import type { DependencyRequirement, DependencyStoreOptions } from '../../workspace-src/dependencies/Types'
import * as Fixtures from './StoreFixtures'

const ConflictingDependencyCommitsErrorRegx = /conflicting commits/
const RestoreDependencyLockErrorRegx = /restore it from version control or repair it explicitly/
const InvalidDependencyLockErrorRegx = /invalid/
const UnsupportedDependencyLockVersionErrorRegx = /unsupported format version 1/
const DependencyLockInsideProjectErrorRegx = /inside the project/
const TaoProjectRootRequiredErrorRegx = /must point to a Tao project root/
const DependencyLockFileSuffixRegx = /\.lock$/

Tests.test('prepared Git sources reuse immutable pins and explicit updates leave other pins intact', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-store-${Platform.randomUUID()}`)
  const requirements: DependencyRequirement[] = [
    { provider: 'github', identifier: 'example/one', version: 'main', alias: '@one' },
    { provider: 'github', identifier: 'example/two', version: 'main', alias: '@two' },
  ]
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    await verifyPinnedUpdates(root, requirements)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('file dependencies remain live and retain their managed graph references', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-live-${Platform.randomUUID()}`)
  const source = Path.join(root, 'local-source')
  const initial: DependencyRequirement[] = [{
    provider: 'file',
    identifier: './local-source',
    version: '*',
    alias: '@local',
  }]
  const options: DependencyStoreOptions = {
    readRequirements: async () => [],
    acquireLock: async () => ({ release() {} }),
    git: {
      async resolveCommit() {
        throw new Error('unexpected Git resolution')
      },
      async fetchCommit() {
        throw new Error('unexpected Git fetch')
      },
    },
  }

  await Try(async () => {
    await Fixtures.createProjectMarker(source)
    await FileSystem.writeFile(Path.join(root, 'Main.tao'), 'app Main {}\n')
    await prepareFileSourceAndGraph(root, source, initial, options)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function prepareFileSourceAndGraph(
  root: string,
  source: string,
  requirements: DependencyRequirement[],
  options: DependencyStoreOptions,
): Promise<void> {
  const lock = await Store.prepareDependencies(root, requirements, options)
  Tests.expect(lock.sources['file:local-source']?.location).toBe(source)
  const durable = Path.join(root, '.tao', 'store', 'npm', 'app.lock')
  await FileSystem.mkdir(Path.dirname(durable), { recursive: true })
  await FileSystem.writeFile(durable, 'graph')
  await FileSystem.writeFile(`${durable.slice(0, -'.lock'.length)}.sha256`, 'hash\n')
  await LockFile.recordManagedGraphReference(root, 'Main.tao', 'a'.repeat(64), durable, 'b'.repeat(64))
  const roundTripped = await LockFile.readDependencyLock(Path.join(root, '.tao', 'store', 'dependencies.lock.json'))
  Tests.expect(roundTripped?.sources['file:local-source']?.location).toBe('local-source')
  await LockFile.pruneUnreferencedManagedLocks(root)
  Tests.expect(await FileSystem.exists(durable)).toBe(true)
}

Tests.test('transitive requirements cannot pin one Git source to two commits', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-conflict-${Platform.randomUUID()}`)
  const options: DependencyStoreOptions = {
    storeRoot: Path.join(root, 'cache'),
    acquireLock: async () => ({ release() {} }),
    async readRequirements(location) {
      if (location.includes('example--one')) {
        return [Fixtures.createGithubRequirement('example/shared', 'v1')]
      }
      if (location.includes('example--two')) {
        return [Fixtures.createGithubRequirement('example/shared', 'v2')]
      }
      return []
    },
    git: {
      resolveCommit: async (_repository, version) => version === 'v1' ? '1'.repeat(40) : '2'.repeat(40),
      async fetchCommit(_repository, _commit, destination) {
        await FileSystem.mkdir(destination, { recursive: true })
        await Fixtures.createProjectMarker(destination)
      },
    },
  }
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    await Tests.rejects(
      Store.prepareDependencies(
        root,
        [Fixtures.createGithubRequirement('example/one'), Fixtures.createGithubRequirement('example/two')],
        options,
      ),
      ConflictingDependencyCommitsErrorRegx,
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('same source at different refs keeps each alias resolvable when commits match', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-aliases-${Platform.randomUUID()}`)
  const requirements = [
    { provider: 'github', identifier: 'example/shared', version: 'v1', alias: 'first' },
    { provider: 'github', identifier: 'example/shared', version: 'v2', alias: 'second' },
  ] satisfies DependencyRequirement[]
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    const commits = new Map([['example/shared:v1', 'a'.repeat(40)], ['example/shared:v2', 'a'.repeat(40)]])
    const calls: string[] = []
    const options = Fixtures.createGitDependencyFixtureOptions(root, commits, calls)
    const lock = await Store.prepareDependencies(
      root,
      requirements,
      options,
    )
    Tests.expect(lock.commitPins).toEqual({
      'github:example/shared@v1': 'a'.repeat(40),
      'github:example/shared@v2': 'a'.repeat(40),
    })
    Tests.expect(Store.resolveLockedAlias(lock, root, 'first', root)?.identity).toBe('github:example/shared')
    Tests.expect(Store.resolveLockedAlias(lock, root, 'second', root)?.identity).toBe('github:example/shared')
    const resolutionCount = calls.filter(call => call.startsWith('resolve:')).length
    commits.set('example/shared:v1', 'b'.repeat(40))
    commits.set('example/shared:v2', 'b'.repeat(40))
    const unchanged = await Store.prepareDependencies(root, requirements, options)
    Tests.expect(unchanged.sources['github:example/shared']?.commit).toBe('a'.repeat(40))
    Tests.expect(calls.filter(call => call.startsWith('resolve:')).length).toBe(resolutionCount)
    await Tests.rejects(
      Store.prepareDependencies(root, requirements, options, ['first']),
      ConflictingDependencyCommitsErrorRegx,
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('prepare refuses to replace a malformed durable lock', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-invalid-lock-${Platform.randomUUID()}`)
  await Try(async () => {
    const lockPath = Path.join(root, '.tao', 'store', 'dependencies.lock.json')
    await FileSystem.mkdir(Path.dirname(lockPath), { recursive: true })
    await FileSystem.writeFile(lockPath, '{ broken')
    await Tests.rejects(
      Store.prepareDependencies(root, [], Fixtures.createGitDependencyFixtureOptions(root, new Map(), [])),
      RestoreDependencyLockErrorRegx,
    )
    Tests.expect(await FileSystem.readFile(lockPath, 'utf8')).toBe('{ broken')
    await FileSystem.rm(lockPath)
    const calls: string[] = []
    const commits = new Map([['example/one:main', 'a'.repeat(40)]])
    const options = Fixtures.createGitDependencyFixtureOptions(root, commits, calls)
    const pinned = await Store.prepareDependencies(root, [Fixtures.createGithubRequirement('example/one')], options)
    pinned.commitPins = {}
    const damaged = JSON.stringify(pinned)
    await FileSystem.writeFile(lockPath, damaged)
    commits.set('example/one:main', 'b'.repeat(40))
    const priorCalls = calls.length
    await Tests.rejects(
      Store.prepareDependencies(root, [Fixtures.createGithubRequirement('example/one')], options),
      InvalidDependencyLockErrorRegx,
    )
    Tests.expect(calls).toHaveLength(priorCalls)
    Tests.expect(await FileSystem.readFile(lockPath, 'utf8')).toBe(damaged)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('dependency lock preparation rejects v1 without guessing per-ref commit pins', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-v1-lock-${Platform.randomUUID()}`)
  const path = Path.join(root, '.tao', 'store', 'dependencies.lock.json')
  await Try(async () => {
    await FileSystem.mkdir(Path.dirname(path), { recursive: true })
    await FileSystem.writeFile(path, JSON.stringify({ version: 1, roots: {}, sources: {} }))
    await Tests.rejects(LockFile.readDependencyLock(path), UnsupportedDependencyLockVersionErrorRegx)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('managed npm graph references validate paths and survive source preparation', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-graphs-${Platform.randomUUID()}`)
  const exactLock = Path.join(root, '.tao', 'store', 'npm', 'graph.lock')
  const fingerprint = 'a'.repeat(64)
  const hash = 'b'.repeat(64)
  await Try(async () => {
    await FileSystem.mkdir(Path.dirname(exactLock), { recursive: true })
    const lock = await LockFile.recordManagedGraphReference(root, 'app/Main.tao', fingerprint, exactLock, hash)
    Tests.expect(lock.npmGraphs?.['app/Main.tao']).toEqual({
      fingerprint,
      lockPath: '.tao/store/npm/graph.lock',
      lockHash: hash,
    })
    await Store.prepareDependencies(root, [], Fixtures.createGitDependencyFixtureOptions(root, new Map(), []))
    Tests.expect(
      (await LockFile.readDependencyLock(Path.join(root, '.tao', 'store', 'dependencies.lock.json')))?.npmGraphs,
    )
      .toEqual(lock.npmGraphs)
    await Tests.rejects(
      LockFile.recordManagedGraphReference(
        root,
        'app/Main.tao',
        fingerprint,
        Path.join(root, '..', 'outside.lock'),
        hash,
      ),
      DependencyLockInsideProjectErrorRegx,
    )
    const durablePath = Path.join(root, '.tao', 'store', 'dependencies.lock.json')
    const stored = await FileSystem.readFile(durablePath, 'utf8')
    await FileSystem.writeFile(durablePath, stored.replace('.tao/store/npm/graph.lock', '../outside.lock'))
    await Tests.rejects(LockFile.readDependencyLock(durablePath), InvalidDependencyLockErrorRegx)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('bundled sources require ordinary project marker metadata', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-bundled-${Platform.randomUUID()}`)
  const bundledRoot = Path.join(root, 'stdlib-src')
  const requirement: DependencyRequirement = { provider: 'bundled', identifier: 'tao', version: 'bundled' }
  const options: DependencyStoreOptions = {
    bundledProjects: { tao: bundledRoot },
    readRequirements: async () => [],
    acquireLock: async () => ({ release() {} }),
    git: {
      async resolveCommit() {
        throw new Error('unexpected Git resolution')
      },
      async fetchCommit() {
        throw new Error('unexpected Git fetch')
      },
    },
  }
  await Try(async () => {
    await FileSystem.mkdir(bundledRoot, { recursive: true })
    await FileSystem.writeFile(Path.join(root, 'Main.tao'), 'app Main {}\n')
    await Tests.rejects(Store.prepareDependencies(root, [requirement], options), TaoProjectRootRequiredErrorRegx)
    await FileSystem.mkdir(Path.join(bundledRoot, '.tao'))
    await Store.prepareDependencies(root, [requirement], options)
    const portableLock = await FileSystem.readFile(Path.join(root, '.tao', 'store', 'dependencies.lock.json'), 'utf8')
    Tests.expect(portableLock).not.toContain(bundledRoot)
    Tests.expect(JSON.parse(portableLock).sources['bundled:tao'].location).toBeUndefined()
    const replacement = Path.join(root, 'new-bundle')
    await FileSystem.mkdir(Path.join(replacement, '.tao'), { recursive: true })
    const nextOptions = { ...options, bundledProjects: { tao: replacement } }
    const updated = await Store.prepareDependencies(root, [requirement], nextOptions)
    Tests.expect(updated.sources['bundled:tao']?.location).toBe(replacement)
    await roundTripBundledLock(root)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function roundTripBundledLock(root: string): Promise<void> {
  const durable = Path.join(root, '.tao', 'store', 'npm', 'bundled.lock')
  await FileSystem.mkdir(Path.dirname(durable), { recursive: true })
  await FileSystem.writeFile(durable, 'graph')
  await FileSystem.writeFile(`${durable.slice(0, -'.lock'.length)}.sha256`, 'hash\n')
  await LockFile.recordManagedGraphReference(root, 'Main.tao', 'c'.repeat(64), durable, 'd'.repeat(64))
  const lock = await LockFile.readDependencyLock(Path.join(root, '.tao', 'store', 'dependencies.lock.json'))
  Tests.expect(lock?.sources['bundled:tao']?.location).toBeUndefined()
  await LockFile.pruneUnreferencedManagedLocks(root)
  Tests.expect(await FileSystem.exists(durable)).toBe(true)
}

Tests.test('prunes only npm locks without source graph or retained profile references', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-prune-${Platform.randomUUID()}`)
  const npm = Path.join(root, '.tao', 'store', 'npm')
  const profiles = Path.join(root, '.tao', 'cache', 'managed-modules')
  const referenced = Path.join(npm, 'referenced.lock')
  const retained = Path.join(npm, 'retained.lock')
  const legacyRetained = Path.join(npm, 'legacy-retained.lock')
  const orphan = Path.join(npm, 'orphan.lock')
  await Try(async () => {
    await FileSystem.mkdir(npm, { recursive: true })
    await FileSystem.mkdir(profiles, { recursive: true })
    await FileSystem.writeFile(Path.join(root, 'Main.tao'), 'app Main {}\n')
    await FileSystem.mkdir(Path.join(profiles, 'retained-install'), { recursive: true })
    for (const path of [referenced, retained, legacyRetained, orphan]) {
      await FileSystem.writeFile(path, path)
      await FileSystem.writeFile(path.replace(DependencyLockFileSuffixRegx, '.sha256'), 'hash\n')
    }
    await FileSystem.writeFile(
      Path.join(profiles, 'retained-install', '.tao-managed.json'),
      JSON.stringify({ graphFingerprint: 'retained' }),
    )
    await FileSystem.mkdir(Path.join(profiles, 'legacy-install'), { recursive: true })
    await FileSystem.writeFile(
      Path.join(profiles, 'legacy-install', '.tao-managed.json'),
      JSON.stringify({ fingerprint: 'legacy-retained', graphFingerprint: 'different-graph' }),
    )
    await LockFile.recordManagedGraphReference(root, 'Main.tao', 'a'.repeat(64), referenced, 'b'.repeat(64))
    await LockFile.pruneUnreferencedManagedLocks(root)
    Tests.expect(await FileSystem.exists(referenced)).toBe(true)
    Tests.expect(await FileSystem.exists(retained)).toBe(true)
    Tests.expect(await FileSystem.exists(legacyRetained)).toBe(false)
    Tests.expect(await FileSystem.exists(orphan)).toBe(false)
    Tests.expect(await FileSystem.exists(orphan.replace(DependencyLockFileSuffixRegx, '.sha256'))).toBe(false)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function verifyPinnedUpdates(root: string, requirements: DependencyRequirement[]): Promise<void> {
  const commits = new Map([['example/one:main', '1'.repeat(40)], ['example/two:main', '2'.repeat(40)]])
  const calls: string[] = []
  const options = Fixtures.createGitDependencyFixtureOptions(root, commits, calls)
  const first = await Store.prepareDependencies(root, requirements, options)
  const savedLock = await FileSystem.readFile(Path.join(root, '.tao', 'store', 'dependencies.lock.json'), 'utf8')
  commits.set('example/one:main', '3'.repeat(40))
  const unchanged = await Store.prepareDependencies(root, requirements, options)
  const updated = await Store.prepareDependencies(root, requirements, options, ['@one'])
  Tests.expect(first.sources['github:example/one']?.commit).toBe('1'.repeat(40))
  Tests.expect(unchanged.sources['github:example/one']?.commit).toBe('1'.repeat(40))
  Tests.expect(updated.sources['github:example/one']?.commit).toBe('3'.repeat(40))
  Tests.expect(updated.sources['github:example/two']?.commit).toBe('2'.repeat(40))
  Tests.expect(savedLock).not.toContain(root)
  Tests.expect(Store.resolveLockedAlias(first, root, '@one', root)?.identity).toBe('github:example/one')
  Tests.expect(Store.resolveLockedAlias(first, root, 'missing', root)).toBeUndefined()
  Tests.expect(calls.filter(call => call.startsWith('fetch:'))).toEqual([
    `fetch:${'1'.repeat(40)}`,
    `fetch:${'2'.repeat(40)}`,
    `fetch:${'3'.repeat(40)}`,
  ])
}
