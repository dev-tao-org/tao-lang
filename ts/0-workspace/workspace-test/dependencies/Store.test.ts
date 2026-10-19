import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { readDependencyLock, recordManagedGraphReference } from '../../workspace-src/dependencies/LockFile'
import {
  prepareDependencies,
  readPreparedDependencies,
  resolveLockedAlias,
} from '../../workspace-src/dependencies/Store'
import type { DependencyRequirement, DependencyStoreOptions } from '../../workspace-src/dependencies/Types'

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

Tests.test('changed requirements require preparation and file dependencies remain live', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-live-${Platform.randomUUID()}`)
  const source = Path.join(root, 'local-source')
  const initial: DependencyRequirement[] = [{
    provider: 'file',
    identifier: './local-source',
    version: '*',
    alias: '@local',
  }]
  let nested: DependencyRequirement[] = []
  const options: DependencyStoreOptions = {
    readRequirements: async () => nested,
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
    await createProjectMarker(source)
    const lock = await prepareDependencies(root, initial, options)
    Tests.expect(lock.sources['file:local-source']?.location).toBe(source)
    await recordManagedGraphReference(
      root,
      'Main.tao',
      'a'.repeat(64),
      Path.join(root, '.tao', 'store', 'npm', 'app.lock'),
      'b'.repeat(64),
    )
    Tests.expect((await readPreparedDependencies(root, initial, options)).sources['file:local-source']?.location).toBe(
      source,
    )
    await readPreparedDependencies(root, initial, options)
    nested = [{ provider: 'file', identifier: '../other', version: '*', alias: '@other' }]
    await Tests.rejects(readPreparedDependencies(root, initial, options), /prepare dependencies, then retry/)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('transitive requirements cannot pin one Git source to two commits', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-conflict-${Platform.randomUUID()}`)
  const options: DependencyStoreOptions = {
    storeRoot: Path.join(root, 'cache'),
    acquireLock: async () => ({ release() {} }),
    async readRequirements(location) {
      if (location.includes('example--one')) {
        return [githubRequirement('example/shared', 'v1')]
      }
      if (location.includes('example--two')) {
        return [githubRequirement('example/shared', 'v2')]
      }
      return []
    },
    git: {
      resolveCommit: async (_repository, version) => version === 'v1' ? '1'.repeat(40) : '2'.repeat(40),
      async fetchCommit(_repository, _commit, destination) {
        await FileSystem.mkdir(destination, { recursive: true })
        await createProjectMarker(destination)
      },
    },
  }
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    await Tests.rejects(
      prepareDependencies(root, [githubRequirement('example/one'), githubRequirement('example/two')], options),
      /conflicting commits/,
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
    const options = fixtureOptions(root, commits, calls)
    const lock = await prepareDependencies(
      root,
      requirements,
      options,
    )
    Tests.expect(resolveLockedAlias(lock, root, 'first', root)?.identity).toBe('github:example/shared')
    Tests.expect(resolveLockedAlias(lock, root, 'second', root)?.identity).toBe('github:example/shared')
    const resolutionCount = calls.filter(call => call.startsWith('resolve:')).length
    commits.set('example/shared:v1', 'b'.repeat(40))
    commits.set('example/shared:v2', 'b'.repeat(40))
    const unchanged = await prepareDependencies(root, requirements, options)
    Tests.expect(unchanged.sources['github:example/shared']?.commit).toBe('a'.repeat(40))
    Tests.expect(calls.filter(call => call.startsWith('resolve:')).length).toBe(resolutionCount)
    await Tests.rejects(prepareDependencies(root, requirements, options, ['first']), /conflicting commits/)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('prepare refuses to replace a malformed durable lock', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-invalid-lock-${Platform.randomUUID()}`)
  await Try(async () => {
    const lockPath = Path.join(root, '.tao', 'store', 'dependencies.lock.json')
    await FileSystem.mkdir(Path.dirname(lockPath), { recursive: true })
    await FileSystem.writeFile(lockPath, '{ broken')
    await Tests.rejects(
      prepareDependencies(root, [], fixtureOptions(root, new Map(), [])),
      /restore it from version control or repair it explicitly/,
    )
    Tests.expect(await FileSystem.readFile(lockPath, 'utf8')).toBe('{ broken')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('managed npm graph references validate paths and survive source preparation', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-graphs-${Platform.randomUUID()}`)
  const exactLock = Path.join(root, '.tao', 'store', 'npm', 'graph.lock')
  const fingerprint = 'a'.repeat(64)
  const hash = 'b'.repeat(64)
  await Try(async () => {
    await FileSystem.mkdir(Path.dirname(exactLock), { recursive: true })
    const lock = await recordManagedGraphReference(root, 'app/Main.tao', fingerprint, exactLock, hash)
    Tests.expect(lock.npmGraphs?.['app/Main.tao']).toEqual({
      fingerprint,
      lockPath: '.tao/store/npm/graph.lock',
      lockHash: hash,
    })
    await prepareDependencies(root, [], fixtureOptions(root, new Map(), []))
    Tests.expect((await readDependencyLock(Path.join(root, '.tao', 'store', 'dependencies.lock.json')))?.npmGraphs)
      .toEqual(lock.npmGraphs)
    await Tests.rejects(
      recordManagedGraphReference(root, 'app/Main.tao', fingerprint, Path.join(root, '..', 'outside.lock'), hash),
      /inside the project/,
    )
    const durablePath = Path.join(root, '.tao', 'store', 'dependencies.lock.json')
    const stored = await FileSystem.readFile(durablePath, 'utf8')
    await FileSystem.writeFile(durablePath, stored.replace('.tao/store/npm/graph.lock', '../outside.lock'))
    await Tests.rejects(readDependencyLock(durablePath), /invalid/)
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
    await Tests.rejects(prepareDependencies(root, [requirement], options), /must point to a Tao project root/)
    await FileSystem.mkdir(Path.join(bundledRoot, '.tao'))
    const prepared = await prepareDependencies(root, [requirement], options)
    const loaded = await readPreparedDependencies(root, [requirement], options)
    Tests.expect(loaded.sources['bundled:tao']?.location).toBe(bundledRoot)
    Tests.expect(prepared.roots).toEqual(loaded.roots)
    const replacement = Path.join(root, 'new-bundle')
    await FileSystem.mkdir(Path.join(replacement, '.tao'), { recursive: true })
    const nextOptions = { ...options, bundledProjects: { tao: replacement } }
    await Tests.rejects(readPreparedDependencies(root, [requirement], nextOptions), /Bundled project tao changed/)
    const updated = await prepareDependencies(root, [requirement], nextOptions)
    Tests.expect(updated.sources['bundled:tao']?.location).toBe(replacement)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function verifyPinnedUpdates(root: string, requirements: DependencyRequirement[]): Promise<void> {
  const commits = new Map([['example/one:main', '1'.repeat(40)], ['example/two:main', '2'.repeat(40)]])
  const calls: string[] = []
  const options = fixtureOptions(root, commits, calls)
  const first = await prepareDependencies(root, requirements, options)
  const savedLock = await FileSystem.readFile(Path.join(root, '.tao', 'store', 'dependencies.lock.json'), 'utf8')
  commits.set('example/one:main', '3'.repeat(40))
  const unchanged = await prepareDependencies(root, requirements, options)
  const updated = await prepareDependencies(root, requirements, options, ['@one'])
  Tests.expect(first.sources['github:example/one']?.commit).toBe('1'.repeat(40))
  Tests.expect(unchanged.sources['github:example/one']?.commit).toBe('1'.repeat(40))
  Tests.expect(updated.sources['github:example/one']?.commit).toBe('3'.repeat(40))
  Tests.expect(updated.sources['github:example/two']?.commit).toBe('2'.repeat(40))
  Tests.expect(savedLock).not.toContain(root)
  Tests.expect(resolveLockedAlias(first, root, '@one', root)?.identity).toBe('github:example/one')
  Tests.expect(resolveLockedAlias(first, root, 'missing', root)).toBeUndefined()
  Tests.expect(calls.filter(call => call.startsWith('fetch:'))).toEqual([
    `fetch:${'1'.repeat(40)}`,
    `fetch:${'2'.repeat(40)}`,
    `fetch:${'3'.repeat(40)}`,
  ])
  Tests.expect((await readPreparedDependencies(root, requirements, options)).roots).toEqual(updated.roots)
}

function fixtureOptions(
  root: string,
  commits: Map<string, string>,
  calls: string[],
): DependencyStoreOptions {
  return {
    storeRoot: Path.join(root, 'cache'),
    readRequirements: async () => [],
    acquireLock: async () => ({ release() {} }),
    git: {
      async resolveCommit(repository, version) {
        const key = `${repository.split('/').slice(-2).join('/').replace('.git', '')}:${version}`
        calls.push(`resolve:${key}`)
        return commits.get(key)!
      },
      async fetchCommit(_repository, commit, destination) {
        calls.push(`fetch:${commit}`)
        await FileSystem.mkdir(destination, { recursive: true })
        await createProjectMarker(destination)
      },
    },
  }
}

function githubRequirement(identifier: string, version = 'main'): DependencyRequirement {
  return { provider: 'github', identifier, version }
}

async function createProjectMarker(root: string): Promise<void> {
  await FileSystem.mkdir(Path.join(root, '.tao'), { recursive: true })
}
