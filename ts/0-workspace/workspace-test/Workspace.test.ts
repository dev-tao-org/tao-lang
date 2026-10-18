import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { createWorkspace } from '../workspace-src/Workspace'

Tests.test('a rapid edit burst compiles only the active and newest queued source', async () => {
  const source = await Tests.readApp('Hello World')
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
    compile(_document, options) {
      compiled.push(options.revision)
      return 'compiled ' + options.revision
    },
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
  const source = await Tests.readApp('Hello World')
  let publishCount = 0
  const workspace = createWorkspace({
    compile() {
      return 'compiled app'
    },
    async publish() {
      publishCount++
    },
  })

  Tests.expect(await workspace.update(source)).toMatchObject({ status: 'published', revision: 'r1' })
  Tests.expect(await workspace.update(source.slice(0, 3))).toMatchObject({ status: 'invalid', revision: 'r2' })
  Tests.expect(workspace.lastGoodRevision).toBe('r1')
  Tests.expect(publishCount).toBe(1)
})

Tests.test('opening another source invalidates an in-flight publication from the old file', async () => {
  await verifyOpeningAnotherSourceInvalidatesOldPublication()
})

async function verifyOpeningAnotherSourceInvalidatesOldPublication(): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `workspace-open-race-${Platform.randomUUID()}`)
  const pathA = Path.join(directory, 'A.tao')
  const pathB = Path.join(directory, 'B.tao')
  const source = await Tests.readApp('Hello World')
  let releaseA!: () => void
  let enteredA!: () => void
  const gateA = new Promise<void>(resolve => releaseA = resolve)
  const enteredPublishA = new Promise<void>(resolve => enteredA = resolve)
  const published: string[] = []
  const workspace = createWorkspace({
    compile(_document, options) {
      return options.revision
    },
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
    await FileSystem.mkdir(directory, { recursive: true })
    await FileSystem.writeFile(pathA, source)
    await FileSystem.writeFile(pathB, source.replace('Hello World', 'Source B'))
    const openA = workspace.openFile(pathA)
    await enteredPublishA
    const openB = workspace.openFile(pathB)
    releaseA()

    Tests.expect(await openA).toMatchObject({ status: 'superseded' })
    Tests.expect(await openB).toMatchObject({ status: 'published', revision: 'r2' })
    Tests.expect(published).toEqual([source.replace('Hello World', 'Source B')])
  }, {
    async finally() {
      releaseA()
      workspace.dispose()
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
}
