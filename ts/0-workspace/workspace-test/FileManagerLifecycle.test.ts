import { Errors, Time } from '@shared'
import { Tests, WorkspaceWatch } from '@shared/os'
import { FileManager, type FileManagerOptions } from '../workspace-src/FileManager'
import type { UpdateResult } from '../workspace-src/Workspace'

type WatchChangeHandler = (change: WorkspaceWatch.WorkspaceChange) => void
type OptionalWatchChangeHandler = WatchChangeHandler | undefined
type ScheduledCallback = () => void
type OptionalScheduledCallback = ScheduledCallback | undefined

Tests.test('switching entries cancels the previous entry debounce', async () => {
  const reading = gate()
  const release = gate()
  const fixture = managerFixture({
    async read(path, observedAtMs) {
      if (path.endsWith('B.tao')) {
        reading.resolve()
        await release.promise
      }
      return { source: path, observedAtMs }
    },
  })
  await fixture.manager.openFile('/workspace/A.tao')
  fixture.notify()
  const opening = fixture.manager.openFile('/workspace/B.tao')
  await reading.promise
  fixture.flush()
  release.resolve()
  Tests.expect((await opening).status).toBe('published')
  Tests.expect(fixture.compiled).toEqual(['/workspace/A.tao', '/workspace/B.tao'])
  await fixture.manager.dispose()
})

Tests.test('a superseded disk read cannot overwrite a newer in-memory document', async () => {
  const reading = gate()
  const release = gate()
  const fixture = managerFixture({
    async read(_path, observedAtMs) {
      reading.resolve()
      await release.promise
      return { source: 'old', observedAtMs }
    },
  })
  const opening = fixture.manager.openFile('/workspace/A.tao')
  await reading.promise
  const update = fixture.manager.update('new')
  release.resolve()
  Tests.expect((await update).status).toBe('published')
  Tests.expect(fixture.compiled).toEqual(['new'])
  Tests.expect(fixture.manager.getDocument('/workspace/A.tao')?.snapshot()).toEqual({
    path: '/workspace/A.tao',
    source: 'new',
    version: 1,
  })
  await fixture.manager.dispose()
  await opening
})

Tests.test('observer failures are reported without stranding the compilation lane', async () => {
  const errors: unknown[] = []
  const fixture = managerFixture({
    onSourceUpdate() {
      Errors.ThrowShouldNeverHappen('observer failed')
    },
    onSourceError(error) {
      errors.push(error)
    },
  })
  fixture.manager.onCompiled(() => Errors.ThrowShouldNeverHappen('listener failed'))
  Tests.expect((await fixture.manager.update('first')).status).toBe('published')
  Tests.expect((await fixture.manager.update('second')).status).toBe('published')
  Tests.expect(fixture.compiled).toEqual(['first', 'second'])
  Tests.expect(errors).toHaveLength(4)
  await fixture.manager.dispose()
})

Tests.test('disk compilation failures retain the source identity for edit observers', async () => {
  const fixture = managerFixture({
    compile: async () => Errors.ThrowShouldNeverHappen('compile failed'),
  })
  const events: unknown[] = []
  fixture.manager.onCompiled(event => {
    events.push(event)
  })
  const result = await fixture.manager.compileFile('/workspace/A.tao')
  Tests.expect(result).toMatchObject({ status: 'failed', error: 'UnexpectedBehaviorError: compile failed' })
  Tests.expect(events).toMatchObject([{ path: '/workspace/A.tao', source: 'source', version: 1, result }])
  await fixture.manager.dispose()
})

function managerFixture(options: Partial<FileManagerOptions> = {}) {
  let notify: OptionalWatchChangeHandler
  let scheduled: OptionalScheduledCallback
  const compiled: string[] = []
  const manager = new FileManager({
    directory: '/workspace',
    read: async (_path, observedAtMs) => ({ source: 'source', observedAtMs }),
    async watch(_root, changed) {
      notify = changed
      return { async dispose() {} }
    },
    schedule(_delay, callback) {
      scheduled = callback
      return () => {
        scheduled = undefined
      }
    },
    async compile(request): Promise<UpdateResult> {
      compiled.push(request.source)
      return {
        status: 'published',
        revision: `r${request.id}`,
        timings: [],
        stages: {
          typecheck: { stage: 'typecheck', status: 'skipped' },
          fix: { stage: 'fix', status: 'skipped' },
          check: { stage: 'check', status: 'skipped' },
        },
      }
    },
    ...options,
  })
  return {
    manager,
    compiled,
    notify() {
      notify?.({ path: '/workspace/A.tao', kind: 'change', observedAtMs: Time.timestampMs() })
    },
    flush() {
      const callback = scheduled
      scheduled = undefined
      callback?.()
    },
  }
}

function gate() {
  let resolve!: () => void
  return { promise: new Promise<void>(complete => resolve = complete), resolve: () => resolve() }
}
