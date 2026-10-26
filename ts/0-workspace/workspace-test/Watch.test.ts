import { Time, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { FileManager } from '../workspace-src/FileManager'
import * as WatchFixture from './WatchFixture'

Tests.test('opening waits for the latest selected-entry read after an observed change', async () => {
  const fixture = WatchFixture.createManagerFixture(async (_path, _observedAtMs, index) => {
    if (index === 0) {
      fixtureStarted.resolve()
      await oldRead.promise
      return WatchFixture.createReadSnapshot('older')
    }
    return WatchFixture.createReadSnapshot('newer')
  })
  const oldRead = WatchFixture.createDeferredVoid()
  const fixtureStarted = WatchFixture.createDeferredVoid()
  const opening = fixture.manager.openFile('/workspace/App.tao')
  await fixtureStarted.promise
  fixture.notify('change', '/workspace/App.tao')
  fixture.flush()
  fixture.notify('change', '/workspace/App.tao')
  fixture.flush()
  Tests.expect(fixture.readCount).toBe(1)
  oldRead.resolve()
  Tests.expect(await opening).toMatchObject({ status: 'published' })
  Tests.expect(fixture.readCount).toBe(2)
  Tests.expect(fixture.maxConcurrentReads).toBe(1)
  await fixture.dispose()
  Tests.expect(fixture.compiled).toEqual(['newer'])
})

Tests.test('a rapid workspace burst reads once and compiles only current plus latest work', async () => {
  const activeGate = WatchFixture.createDeferredVoid()
  const activeStarted = WatchFixture.createDeferredVoid()
  let reads = 0
  const fixture = WatchFixture.createManagerFixture(
    async () => WatchFixture.createReadSnapshot(++reads === 1 ? 'initial' : 'latest'),
    async (source, isCurrent) => {
      if (source === 'active') {
        activeStarted.resolve()
        await activeGate.promise
      }
      return WatchFixture.createUpdateResult(isCurrent() ? 'published' : 'superseded')
    },
  )
  await fixture.manager.openFile('/workspace/App.tao')
  const active = fixture.manager.update('active')
  await activeStarted.promise
  for (let index = 0; index < 20; index++) {
    fixture.notify(index % 2 ? 'change' : 'addDir', `/workspace/sub-${index}`)
  }
  fixture.flush()
  activeGate.resolve()
  Tests.expect(await active).toMatchObject({ status: 'superseded' })
  Tests.expect(await fixture.waitForCompiled('latest')).toMatchObject({ status: 'published' })
  Tests.expect(reads).toBe(2)
  Tests.expect(fixture.maxConcurrentReads).toBe(1)
  Tests.expect(fixture.compiled).toEqual(['initial', 'active', 'latest'])
  await fixture.dispose()
})

Tests.test('disposal cancels a delayed refresh and closes the workspace watcher', async () => {
  let reads = 0
  const fixture = WatchFixture.createManagerFixture(async () => {
    reads++
    return WatchFixture.createReadSnapshot('source')
  })
  await fixture.manager.openFile('/workspace/App.tao')
  fixture.notify('change', '/workspace/App.tao')
  await fixture.manager.dispose()
  fixture.flush()
  Tests.expect(reads).toBe(1)
  Tests.expect(fixture.closed).toBe(1)
})

Tests.test('concurrent entry switches share the configured workspace watcher root', async () => {
  const watcherStarted = WatchFixture.createDeferredVoid()
  const finishWatcherStart = WatchFixture.createDeferredVoid()
  const roots: string[] = []
  const manager = new FileManager({
    directory: '/workspace',
    async watch(root) {
      roots.push(root)
      watcherStarted.resolve()
      await finishWatcherStart.promise
      return { async dispose() {} }
    },
    read: async (_path, observedAtMs) => ({
      source: 'source',
      observedAtMs,
    }),
    compile: async () => WatchFixture.createUpdateResult('published'),
  })
  const first = manager.openFile('App.tao')
  await watcherStarted.promise
  const nested = manager.openFile('nested/Feature.tao')
  finishWatcherStart.resolve()
  Tests.expect(await first).toMatchObject({ status: 'superseded' })
  Tests.expect(await nested).toMatchObject({ status: 'published' })
  Tests.expect(roots).toEqual(['/workspace'])
  Tests.expect(manager.entryPath).toBe('/workspace/nested/Feature.tao')
  await manager.dispose()
})

Tests.test('source notifications refresh the selected entry and ignore output, unrelated and disposed changes', async () => {
  const paths: string[] = []
  const fixture = WatchFixture.createManagerFixture(
    async path => {
      paths.push(path)
      return WatchFixture.createReadSnapshot(`source-${paths.length}`)
    },
    undefined,
    { directory: '/workspace', outputDirectory: '/workspace/generated' },
  )
  await fixture.manager.openFile('/workspace/App.tao')
  const kinds = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const
  for (const [index, kind] of kinds.entries()) {
    fixture.notify(kind, '/workspace/nested/Dependency.tao')
    fixture.flush()
    await fixture.waitForCompiled(`source-${index + 2}`)
  }
  Tests.expect(paths).toEqual(Array.from({ length: 6 }, () => '/workspace/App.tao'))
  fixture.notify('change', '/workspace/generated/Generated.tao')
  fixture.notify('addDir', '/workspace/generated/nested')
  fixture.notify('change', '/workspace/image.png')
  fixture.flush()
  Tests.expect(fixture.readCount).toBe(6)
  await fixture.dispose()
  fixture.notify('change', '/workspace/App.tao')
  fixture.flush()
  Tests.expect(fixture.readCount).toBe(6)
  Tests.expect(fixture.closed).toBe(1)
})

Tests.test('pipeline watches update dynamically and exclude immutable snapshot trees', async () => {
  const fixture = WatchFixture.createDynamicWatchFixture()
  const compiled = WatchFixture.waitForCompiledSource(fixture.manager, 'read-2')
  await fixture.manager.openFile('/workspace/App.tao')
  await fixture.manager.updatePipelineDirectories(
    ['/workspace/source', '/dependencies/producer/src'],
    [],
    ['/workspace/.tao/cache/snapshots'],
  )
  await fixture.manager.updatePipelineDirectories(
    ['/workspace/source', '/dependencies/producer/src'],
    [],
    ['/workspace/.tao/cache/snapshots'],
  )
  Tests.expect(fixture.watchCalls()).toBe(1)
  Tests.expect(fixture.updates()).toEqual([{
    directories: ['/dependencies/producer/src', '/workspace/static'],
    ignored: ['/workspace/.tao/cache/snapshots', '/workspace/output'],
  }])
  fixture.change({
    path: '/workspace/.tao/cache/snapshots/foreign.tsx',
    kind: 'change',
    observedAtMs: Time.timestampMs(),
  })
  Tests.expect(fixture.scheduled()).toBeUndefined()
  fixture.change({ path: '/dependencies/producer/src/View.tao', kind: 'change', observedAtMs: Time.timestampMs() })
  fixture.flush()
  Tests.expect(await compiled).toMatchObject({ status: 'published' })
  await fixture.manager.updatePipelineDirectories([], [], [])
  Tests.expect(fixture.updates()).toHaveLength(2)
  Tests.expect(fixture.updates()[1]!.directories).toEqual(['/workspace/static'])
  await fixture.manager.dispose()
})

Tests.test('reached TypeScript helpers and assets refresh while unrelated assets stay ignored', async () => {
  const fixture = WatchFixture.createDynamicWatchFixture()
  await fixture.manager.openFile('/workspace/App.tao')
  await fixture.manager.updatePipelineDirectories(
    ['/dependencies/producer/src'],
    ['/dependencies/producer/src/format.cts', '/dependencies/producer/src/logo.png'],
    ['/workspace/.tao/cache/snapshots'],
  )

  const helperCompile = WatchFixture.waitForCompiledSource(fixture.manager, 'read-2')
  fixture.change({ path: '/dependencies/producer/src/format.cts', kind: 'change', observedAtMs: Time.timestampMs() })
  Tests.expect(fixture.scheduled()).toBeDefined()
  fixture.flush()
  Tests.expect(await helperCompile).toMatchObject({ status: 'published' })

  const assetCompile = WatchFixture.waitForCompiledSource(fixture.manager, 'read-3')
  fixture.change({ path: '/dependencies/producer/src/logo.png', kind: 'unlink', observedAtMs: Time.timestampMs() })
  Tests.expect(fixture.scheduled()).toBeDefined()
  fixture.flush()
  Tests.expect(await assetCompile).toMatchObject({ status: 'published' })

  await fixture.manager.watchPipelineFiles(['/dependencies/producer/src/new-logo.png'])
  const recoveryCompile = WatchFixture.waitForCompiledSource(fixture.manager, 'read-4')
  fixture.change({
    path: '/dependencies/producer/src/new-logo.png',
    kind: 'add',
    observedAtMs: Time.timestampMs(),
  })
  Tests.expect(fixture.scheduled()).toBeDefined()
  fixture.flush()
  Tests.expect(await recoveryCompile).toMatchObject({ status: 'published' })

  fixture.change({ path: '/workspace/unrelated.png', kind: 'change', observedAtMs: Time.timestampMs() })
  Tests.expect(fixture.scheduled()).toBeUndefined()
  await fixture.manager.dispose()
})

Tests.test('failed external sidecar inputs register their project before missing nested files exist', async () => {
  const directory = Artifacts.resolvePath('tmp', `attempted-sidecar-watch-${Platform.randomUUID()}`)
  const producer = Path.join(directory, 'producer')
  const missingAsset = Path.join(producer, 'new', 'logo.png')
  const fixture = WatchFixture.createDynamicWatchFixture()
  await Try(async () => {
    await FileSystem.mkdir(Path.join(producer, '.tao'), { recursive: true })
    await fixture.manager.openFile('/workspace/App.tao')
    await fixture.manager.watchPipelineFiles([missingAsset])
    Tests.expect(fixture.updates().at(-1)?.directories).toContain(producer)
    Tests.expect(await FileSystem.exists(Path.dirname(missingAsset))).toBe(false)
    const recovered = WatchFixture.waitForCompiledSource(fixture.manager, 'read-2')
    fixture.change({ path: missingAsset, kind: 'add', observedAtMs: Time.timestampMs() })
    fixture.flush()
    Tests.expect(await recovered).toMatchObject({ status: 'published' })
    await fixture.manager.updatePipelineDirectories([], [], [])
    Tests.expect(fixture.updates().at(-1)?.directories).not.toContain(producer)
  }, {
    async finally() {
      await fixture.manager.dispose()
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
})
