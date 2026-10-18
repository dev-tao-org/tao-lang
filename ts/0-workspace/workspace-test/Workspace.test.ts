import { Tests } from '@shared/os'
import { createWorkspace } from '../workspace-src/Workspace'

Tests.test('a rapid edit burst compiles only the active and newest queued source', async () => {
  const source = await Tests.readApp('Hello World')
  let releaseFirst!: () => void
  let enteredFirst!: () => void
  const firstGate = new Promise<void>(resolve => releaseFirst = resolve)
  const firstEntered = new Promise<void>(resolve => enteredFirst = resolve)
  const published: string[] = []
  const compiled: string[] = []
  const workspace = createWorkspace({
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

  const first = workspace.update(source)
  await firstEntered
  const replaced = workspace.update(source.replace('Hello World', 'Hello Tao'))
  const latest = workspace.update(source.replace('Hello World', 'Latest Tao'))
  releaseFirst()

  Tests.expect(await first).toMatchObject({ status: 'superseded', revision: 'r1' })
  Tests.expect(await replaced).toMatchObject({ status: 'superseded', revision: 'r2' })
  Tests.expect(await latest).toMatchObject({ status: 'published', revision: 'r3' })
  Tests.expect(compiled).toEqual(['r1', 'r3'])
  Tests.expect(published).toEqual(['r3'])
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
