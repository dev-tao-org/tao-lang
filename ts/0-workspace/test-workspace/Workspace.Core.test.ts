import { Timings, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { createWorkspace, Document } from '../workspace-src/Workspace'

type WorkspaceEventPath = string | undefined
type WorkspaceEventVersion = number | undefined
type WorkspaceEvent = { path: WorkspaceEventPath; source: string; version: WorkspaceEventVersion }

Tests.test('a rapid edit burst compiles only the active and newest queued source', async () => {
  const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
  let releaseFirst!: () => void
  let enteredFirst!: () => void
  const firstGate = new Promise<void>(resolve => releaseFirst = resolve)
  const firstEntered = new Promise<void>(resolve => enteredFirst = resolve)
  const published: string[] = []
  const compiled: string[] = []
  const expected: [string, number][] = []
  const workspace = createWorkspace({
    onExpected(revision, startedAtMs) {
      expected.push([revision, startedAtMs])
    },
    compile: Timings.createTopLevelTimer((_timings, _document, options) => {
      compiled.push(options.revision)
      return { 'App.tsx': 'compiled ' + options.revision }
    }),
    async publish(app, isCurrent) {
      if (app.revision === 'r1') {
        enteredFirst()
        await firstGate
      }
      if (isCurrent()) {
        published.push(app.revision)
      }
    },
  })

  const first = workspace.update(source, 1000)
  await firstEntered
  const replaced = workspace.update(source.replace('Hello World', 'Hello Tao'))
  const latest = workspace.update(source.replace('Hello World', 'Latest Tao'), 2000)
  releaseFirst()

  Tests.expect(await first).toMatchObject({ status: 'superseded', revision: 'r1' })
  Tests.expect(await replaced).toMatchObject({ status: 'superseded', revision: 'r2' })
  Tests.expect(await latest).toMatchObject({ status: 'published', revision: 'r3' })
  Tests.expect(compiled).toEqual(['r1', 'r3'])
  Tests.expect(published).toEqual(['r3'])
  Tests.expect(expected).toEqual([['r1', 1000], ['r3', 2000]])
})

Tests.test('invalid source retains the last published application', async () => {
  const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
  let publishCount = 0
  const workspace = createWorkspace({
    compile: Timings.createTopLevelTimer(() => ({ 'App.tsx': 'compiled app' })),
    async publish() {
      publishCount++
    },
  })

  Tests.expect(await workspace.update(source)).toMatchObject({ status: 'published', revision: 'r1' })
  Tests.expect(await workspace.update(source.slice(0, 3))).toMatchObject({ status: 'invalid', revision: 'r2' })
  Tests.expect(workspace.lastGoodRevision).toBe('r1')
  Tests.expect(publishCount).toBe(1)
})

Tests.test('a virtual document queues immutable versions without reading its entry from disk', async () => {
  const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
  const document = new Document('/virtual/Hello World.tao', source)
  let releaseFirst!: () => void
  let enteredFirst!: () => void
  const firstGate = new Promise<void>(resolve => releaseFirst = resolve)
  const firstEntered = new Promise<void>(resolve => enteredFirst = resolve)
  const events: WorkspaceEvent[] = []
  const workspace = createWorkspace({
    compile: Timings.createTopLevelTimer((_timings, _document, options) => ({ 'App.tsx': options.revision })),
    async publish(app, isCurrent) {
      if (app.revision === 'r1') {
        enteredFirst()
        await firstGate
      }
      if (isCurrent()) {
        return
      }
    },
  })
  workspace.files.onCompiled(event => events.push({ ...event, version: event.version }))

  const first = workspace.update(document)
  await firstEntered
  document.replaceSource(source)
  const latest = workspace.update(document)
  releaseFirst()
  Tests.expect(await first).toMatchObject({ status: 'superseded' })
  Tests.expect(await latest).toMatchObject({ status: 'published' })
  Tests.expect(events.map(({ path, source: value, version }) => ({ path, source: value, version }))).toEqual([
    { path: document.path, source, version: 0 },
    { path: document.path, source, version: 1 },
  ])
  Tests.expect(workspace.files.getDocument(document.path)).toBe(document)
  await workspace.dispose()
})

Tests.test('opening another source invalidates an in-flight publication from the old file', async () => {
  await verifyOpeningAnotherSourceInvalidatesOldPublication()
})

async function verifyOpeningAnotherSourceInvalidatesOldPublication(): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `workspace-open-race-${Platform.randomUUID()}`)
  const pathA = Path.join(directory, 'A.tao')
  const pathB = Path.join(directory, 'B.tao')
  const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
  let releaseA!: () => void
  let enteredA!: () => void
  const gateA = new Promise<void>(resolve => releaseA = resolve)
  const enteredPublishA = new Promise<void>(resolve => enteredA = resolve)
  const published: string[] = []
  const workspace = createWorkspace({
    compile: Timings.createTopLevelTimer((_timings, _document, options) => ({ 'App.tsx': options.revision })),
    async publish(app, isCurrent) {
      if (app.source === source) {
        enteredA()
        await gateA
      }
      if (isCurrent()) {
        published.push(app.source)
      }
    },
  })

  await Try(async () => {
    await FS.mkdir(directory)
    await FS.writeFile(pathA, source)
    await FS.writeFile(pathB, source.replace('Hello World', 'Source B'))
    const openA = workspace.openFile(pathA)
    await enteredPublishA
    const openB = workspace.openFile(pathB)
    releaseA()

    Tests.expect(await openA).toMatchObject({ status: 'superseded' })
    Tests.expect(await openB).toMatchObject({ status: 'published' })
    Tests.expect(published).toEqual([source.replace('Hello World', 'Source B')])
  }, {
    async finally() {
      releaseA()
      await workspace.dispose()
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
}
