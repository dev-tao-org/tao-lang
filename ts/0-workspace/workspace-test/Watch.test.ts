import { Time, Timings, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests, WorkspaceWatch } from '@shared/os'
import { FileManager, type SourceSnapshot } from '../workspace-src/FileManager'
import { createWorkspace, type UpdateResult } from '../workspace-src/Workspace'

const hostUnavailable = Platform.systemInfo().os === 'Darwin' && !await Try.WithDefault(false, async () => {
  await Platform.requireHostProcessAccess('Workspace watch tests require macOS host access.')
  return true
})

Tests.test('opening waits for the latest selected-entry read after an observed change', async () => {
  const fixture = createManagerFixture(async (_path, _observedAtMs, index) => {
    if (index === 0) {
      fixtureStarted.resolve()
      await oldRead.promise
      return snapshot('older')
    }
    return snapshot('newer')
  })
  const oldRead = deferredVoid()
  const fixtureStarted = deferredVoid()
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
  const activeGate = deferredVoid()
  const activeStarted = deferredVoid()
  let reads = 0
  const fixture = createManagerFixture(
    async () => snapshot(++reads === 1 ? 'initial' : 'latest'),
    async (source, isCurrent) => {
      if (source === 'active') {
        activeStarted.resolve()
        await activeGate.promise
      }
      return result(isCurrent() ? 'published' : 'superseded')
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
  const fixture = createManagerFixture(async () => {
    reads++
    return snapshot('source')
  })
  await fixture.manager.openFile('/workspace/App.tao')
  fixture.notify('change', '/workspace/App.tao')
  await fixture.manager.dispose()
  fixture.flush()
  Tests.expect(reads).toBe(1)
  Tests.expect(fixture.closed).toBe(1)
})

Tests.test('concurrent entry switches share the configured workspace watcher root', async () => {
  const watcherStarted = deferredVoid()
  const finishWatcherStart = deferredVoid()
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
      timings: new Timings('workspace:test'),
    }),
    compile: async () => result('published'),
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

Tests.test.skipIf(hostUnavailable)(
  'workspace changes compile the selected entry and ignore output and post-disposal changes',
  async () => {
    await verifyHostWorkspaceWatching()
  },
  10_000,
)

async function verifyHostWorkspaceWatching(): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `workspace-watch-${Platform.randomUUID()}`)
  const output = Path.join(directory, 'generated-output')
  const path = Path.join(directory, 'App.tao')
  const nested = Path.join(directory, 'nested', 'Feature.tao')
  const source = await Tests.readApp('Hello World')
  const workspace = createWorkspace({ directory, outputDirectory: output, async publish() {} })
  await Try(async () => {
    await FileSystem.mkdir(directory, { recursive: true })
    await FileSystem.writeFile(path, source)
    Tests.expect((await workspace.openFile(path)).status).toBe('published')
    let events = 0
    const stop = workspace.files.onCompiled(event => {
      if (event.result.status === 'published') {
        events++
      }
    })
    await FileSystem.mkdir(Path.dirname(nested), { recursive: true })
    await FileSystem.writeFile(nested, source)
    await waitForCompileCount(() => events, 1)
    const created = events
    const pending = `${path}.pending`
    await FileSystem.writeFile(pending, source)
    await FileSystem.rename(pending, path)
    await waitForCompileCount(() => events, created + 1)
    const replaced = events
    await FileSystem.rm(nested)
    await waitForCompileCount(() => events, replaced + 1)
    await Time.sleep(50)
    const settled = events
    await FileSystem.mkdir(output, { recursive: true })
    await FileSystem.writeFile(Path.join(output, 'Generated.tao'), source)
    await Time.sleep(50)
    Tests.expect(events).toBe(settled)
    await workspace.dispose()
    await FileSystem.writeFile(path, source)
    await Time.sleep(50)
    Tests.expect(events).toBe(settled)
    stop()
  }, {
    async finally() {
      await workspace.dispose()
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
}

type ManagerFixtureState = {
  onChange: ((change: WorkspaceWatch.WorkspaceChange) => void) | undefined
  scheduled: (() => void) | undefined
  readCount: number
  activeReads: number
  maxConcurrentReads: number
  closed: number
  compiled: string[]
  completed: Map<string, UpdateResult>
  waiters: Map<string, (result: UpdateResult) => void>
}

function createManagerFixture(
  read: (path: string, observedAtMs: number, index: number) => Promise<SourceSnapshot>,
  compileSource: (source: string, isCurrent: () => boolean) => Promise<UpdateResult> = async (_source, isCurrent) =>
    result(isCurrent() ? 'published' : 'superseded'),
) {
  const state: ManagerFixtureState = {
    onChange: undefined,
    scheduled: undefined,
    readCount: 0,
    activeReads: 0,
    maxConcurrentReads: 0,
    closed: 0,
    compiled: [],
    completed: new Map(),
    waiters: new Map(),
  }
  const manager = createFixtureManager(read, compileSource, state)
  manager.onCompiled(event => {
    state.completed.set(event.source, event.result)
    state.waiters.get(event.source)?.(event.result)
  })
  return {
    manager,
    compiled: state.compiled,
    get closed() {
      return state.closed
    },
    get readCount() {
      return state.readCount
    },
    get maxConcurrentReads() {
      return state.maxConcurrentReads
    },
    notify(kind: WorkspaceWatch.WorkspaceChange['kind'], path: string) {
      state.onChange?.({ kind, path, observedAtMs: Time.timestampMs() })
    },
    flush() {
      const callback = state.scheduled
      state.scheduled = undefined
      callback?.()
    },
    async waitForCompiled(source: string) {
      const existing = state.completed.get(source)
      return existing ?? await new Promise(resolve => state.waiters.set(source, resolve))
    },
    async dispose() {
      await manager.dispose()
    },
  }
}

function createFixtureManager(
  read: (path: string, observedAtMs: number, index: number) => Promise<SourceSnapshot>,
  compileSource: (source: string, isCurrent: () => boolean) => Promise<UpdateResult>,
  state: ManagerFixtureState,
): FileManager {
  const manager = new FileManager({
    async read(path, observedAtMs) {
      state.activeReads++
      state.maxConcurrentReads = Math.max(state.maxConcurrentReads, state.activeReads)
      return await Try(() => read(path, observedAtMs, state.readCount++), {
        finally() {
          state.activeReads--
        },
      })
    },
    async watch(_directory, change) {
      state.onChange = change
      return {
        async dispose() {
          state.closed++
        },
      }
    },
    schedule(_delayMs, callback) {
      state.scheduled = callback
      return () => {
        state.scheduled = undefined
      }
    },
    async compile(request, isCurrent) {
      state.compiled.push(request.source)
      return await compileSource(request.source, isCurrent)
    },
  })
  return manager
}

function snapshot(source: string): SourceSnapshot {
  return { source, observedAtMs: Time.timestampMs(), timings: new Timings('workspace:test') }
}

function result(status: Exclude<UpdateResult['status'], 'failed'>): UpdateResult {
  return {
    status,
    revision: 'fixture',
    timings: [],
    stages: {
      typecheck: { stage: 'typecheck', status: 'skipped' },
      fix: { stage: 'fix', status: 'skipped' },
      check: { stage: 'check', status: 'skipped' },
    },
  }
}

async function waitForCompileCount(getCount: () => number, expected: number): Promise<void> {
  const deadline = Time.nowMs() + 2000
  while (getCount() < expected && Time.nowMs() < deadline) {
    await Time.sleep(5)
  }
  Tests.expect(getCount()).toBeGreaterThanOrEqual(expected)
}

function deferredVoid() {
  let resolve!: () => void
  const promise = new Promise<void>(complete => resolve = complete)
  return { promise, resolve }
}
