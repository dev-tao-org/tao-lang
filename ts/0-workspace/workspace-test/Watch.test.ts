import { Time, Timings, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { createWorkspace, type UpdateResult } from '../workspace-src/Workspace'
import { type SourceSnapshot, WorkspaceFile } from '../workspace-src/WorkspaceFile'

const hostUnavailable = Platform.systemInfo().os === 'Darwin' && !await Try.WithDefault(false, async () => {
  await Platform.requireHostProcessAccess('File notification tests require macOS host access.')
  return true
})

Tests.test('a newer file read supersedes an older deferred watcher read', async () => {
  await verifyNewerReadSupersedesOlder()
})

Tests.test('a save resolves when its compiled snapshot is superseded', async () => {
  await verifySupersededSaveSettles()
})

Tests.test.skipIf(hostUnavailable)(
  'saved source and external file edits compile through the workspace watcher',
  async () => {
    const directory = Artifacts.resolvePath('tmp', `workspace-watch-${Platform.randomUUID()}`)
    const path = Path.join(directory, 'Hello World.tao')
    const source = await Tests.readApp('Hello World')
    const published: string[] = []
    const workspace = createWorkspace({
      async publish(app) {
        published.push(app.source)
      },
    })
    await Try(async () => {
      await FileSystem.mkdir(directory, { recursive: true })
      await FileSystem.writeFile(path, source)
      Tests.expect((await workspace.openFile(path)).status).toBe('published')
      const edited = source.replace('app ', 'app Saved')
      Tests.expect(edited).not.toBe(source)
      const saved = await workspace.saveSource(current => current.replace('app ', 'app Saved'))
      Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe(edited)
      Tests.expect(saved.status).toBe('published')
      Tests.expect(saved.timings.map(sample => sample.name)).toContain('workspace.read')
      await waitForExternalEdit(workspace, path, source)
      Tests.expect(published).toEqual([source, edited, source])
    }, {
      async finally() {
        workspace.dispose()
        await FileSystem.rm(directory, { recursive: true, force: true })
      },
    })
  },
  10_000,
)

function publishedResult(revision = 'fixture'): UpdateResult {
  return {
    status: 'published' as const,
    revision,
    timings: [],
    stages: {
      typecheck: { stage: 'typecheck', status: 'skipped' },
      fix: { stage: 'fix', status: 'skipped' },
      check: { stage: 'check', status: 'skipped' },
    },
  }
}

async function verifySupersededSaveSettles(): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `workspace-save-race-${Platform.randomUUID()}`)
  const path = Path.join(directory, 'Hello World.tao')
  const fixture = createSupersededSaveFixture(path)
  await Try(async () => {
    await FileSystem.mkdir(directory, { recursive: true })
    await FileSystem.writeFile(path, 'initial')
    Tests.expect((await fixture.file.open()).status).toBe('published')
    const saving = fixture.file.save('saved')
    await waitForFileText(path, 'saved')
    fixture.notifyChange()
    await fixture.savedCompileStarted
    await FileSystem.writeFile(path, 'newer')
    fixture.notifyChange()
    await fixture.newerPublished
    fixture.releaseSavedCompile()
    Tests.expect(await saving).toMatchObject({ status: 'superseded' })
    Tests.expect(fixture.compiled).toEqual(['initial', 'saved', 'newer'])
    Tests.expect(fixture.published).toEqual(['initial', 'newer'])
  }, {
    async finally() {
      fixture.releaseSavedCompile()
      fixture.file.dispose()
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
}

function createSupersededSaveFixture(path: string) {
  let notify!: (observedAtMs: number) => void
  const savedCompileGate = deferredVoid()
  const savedCompileStarted = deferredVoid()
  const newerPublished = deferredVoid()
  const compiled: string[] = []
  const published: string[] = []
  const file = new WorkspaceFile(
    path,
    async snapshot => {
      compiled.push(snapshot.source)
      if (snapshot.source === 'saved') {
        savedCompileStarted.resolve()
        await savedCompileGate.promise
      }
      return publishedResult(snapshot.source)
    },
    result => {
      published.push(result.revision)
      if (result.revision === 'newer') {
        newerPublished.resolve()
      }
    },
    undefined,
    readSnapshotSequence(['initial', 'saved', 'newer']),
    (_path, onChange) => {
      notify = onChange
      return () => {}
    },
  )
  return {
    file,
    compiled,
    published,
    savedCompileStarted: savedCompileStarted.promise,
    newerPublished: newerPublished.promise,
    releaseSavedCompile: savedCompileGate.resolve,
    notifyChange() {
      notify(Time.timestampMs())
    },
  }
}

function readSnapshotSequence(sources: string[]) {
  let index = 0
  return async (_path: string, observedAtMs = Time.timestampMs()): Promise<SourceSnapshot> => ({
    source: sources[index++]!,
    observedAtMs,
    timings: new Timings('workspace:input'),
  })
}

function deferredVoid() {
  let resolve!: () => void
  const promise = new Promise<void>(complete => resolve = complete)
  return { promise, resolve }
}

async function waitForFileText(path: string, expected: string): Promise<void> {
  const deadline = Time.nowMs() + 2000
  while (Time.nowMs() < deadline) {
    if (await FileSystem.readFile(path, 'utf8') === expected) {
      return
    }
    await Time.sleep(1)
  }
  Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe(expected)
}

async function verifyNewerReadSupersedesOlder(): Promise<void> {
  const fixture = createDeferredReadFixture()
  const opening = fixture.file.open()
  await fixture.oldStarted
  fixture.notifyChange()
  await fixture.newStarted
  fixture.releaseNew()
  await fixture.newestPublished
  fixture.releaseOld()
  Tests.expect(await opening).toMatchObject({ status: 'superseded' })
  Tests.expect(fixture.results).toEqual(['newer', 'published'])
  fixture.file.dispose()
}

function createDeferredReadFixture() {
  let releaseOld!: () => void
  let releaseNew!: () => void
  let enteredOld!: () => void
  let enteredNew!: () => void
  let publishedNew!: () => void
  let notify!: (observedAtMs: number) => void
  const oldGate = new Promise<void>(resolve => releaseOld = resolve)
  const newGate = new Promise<void>(resolve => releaseNew = resolve)
  const oldStarted = new Promise<void>(resolve => enteredOld = resolve)
  const newStarted = new Promise<void>(resolve => enteredNew = resolve)
  const newestPublished = new Promise<void>(resolve => publishedNew = resolve)
  const results: string[] = []
  const file = new WorkspaceFile(
    'fixture.tao',
    async snapshot => {
      results.push(snapshot.source)
      return publishedResult()
    },
    result => {
      results.push(result.status)
      if (results.includes('newer') && result.status === 'published') {
        publishedNew()
      }
    },
    undefined,
    readDeferredSources([oldGate, newGate], [enteredOld, enteredNew]),
    (_path, onChange) => {
      notify = onChange
      return () => {}
    },
  )
  return {
    file,
    oldStarted,
    newStarted,
    newestPublished,
    results,
    releaseOld,
    releaseNew,
    notifyChange() {
      notify(Time.timestampMs())
    },
  }
}

function readDeferredSources(gates: Promise<void>[], entered: (() => void)[]) {
  let index = 0
  return async (_path: string, observedAtMs = Time.timestampMs()): Promise<SourceSnapshot> => {
    const current = index++
    entered[current]!()
    await gates[current]
    return {
      source: current === 0 ? 'older' : 'newer',
      observedAtMs,
      timings: new Timings('workspace:input'),
    }
  }
}

async function waitForExternalEdit(workspace: ReturnType<typeof createWorkspace>, path: string, source: string) {
  let complete!: () => void
  let fail!: (error: unknown) => void
  const published = new Promise<void>((resolve, reject) => {
    complete = resolve
    fail = reject
  })
  const stop = workspace.onPublished(() => complete())
  const cancel = Time.schedule(2000, () => fail('External save was not compiled.'))
  await Try(async () => {
    await FileSystem.writeFile(path, source)
    await published
  }, {
    finally() {
      stop()
      cancel()
    },
  })
}
