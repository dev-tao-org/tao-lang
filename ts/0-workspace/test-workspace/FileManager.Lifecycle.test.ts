import { Errors, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { Document } from '../workspace-src/Document'
import { FileManager } from '../workspace-src/FileManager/FileManager'
import type { UpdateResult } from '../workspace-src/Workspace'

Tests.test('observer failures are reported without stranding the compilation lane', async () => {
  const errors: unknown[] = []
  const compiled: string[] = []
  const manager = new FileManager({
    onSourceUpdate() {
      Errors.ThrowShouldNeverHappen('observer failed')
    },
    onSourceError(error) {
      errors.push(error)
    },
    async compile(request): Promise<UpdateResult> {
      compiled.push(request.source)
      return createPublishedResult(request.id)
    },
  })
  manager.onCompiled(() => Errors.ThrowShouldNeverHappen('listener failed'))
  Tests.expect((await manager.update('first')).status).toBe('published')
  Tests.expect((await manager.update('second')).status).toBe('published')
  Tests.expect(compiled).toEqual(['first', 'second'])
  Tests.expect(errors).toHaveLength(4)
  await manager.dispose()
})

Tests.test('disk compilation failures retain the source identity for edit observers', async () => {
  const directory = Artifacts.resolvePath('tmp', `file-manager-lifecycle-${Platform.randomUUID()}`)
  Artifacts.trackTemporary(directory)
  const path = Path.join(directory, 'A.tao')
  await FS.mkdir(directory)
  await FS.writeFile(path, 'source')
  const events: unknown[] = []
  const manager = new FileManager({
    compile: async () => Errors.ThrowShouldNeverHappen('compile failed'),
  })
  manager.onCompiled(event => events.push(event))
  const result = await manager.compileFile(path)
  Tests.expect(result).toMatchObject({ status: 'failed', error: 'UnexpectedBehaviorError: compile failed' })
  Tests.expect(events).toMatchObject([{ path, source: 'source', version: 1, result }])
  await manager.dispose()
})

Tests.test('a pending disk read cannot replace a newer editor document', async () => {
  const directory = Artifacts.resolvePath('tmp', `file-manager-race-${Platform.randomUUID()}`)
  const path = Path.join(directory, 'A.tao')
  const compiled: string[] = []
  const manager = new FileManager({
    async compile(request): Promise<UpdateResult> {
      compiled.push(request.source)
      return createPublishedResult(request.id)
    },
  })
  await Try(async () => {
    await FS.mkdir(directory)
    await FS.writeFile(path, 'disk source')
    const disk = manager.compileFile(path)
    const editor = manager.update(new Document(path, 'editor source'))
    const [diskResult, editorResult] = await Promise.all([disk, editor])
    Tests.expect(diskResult.status).toBe('superseded')
    Tests.expect(editorResult.status).toBe('published')
    Tests.expect(compiled).toEqual(['editor source'])
    Tests.expect(manager.getDocument(path)?.source).toBe('editor source')
  }, {
    async finally() {
      await manager.dispose()
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
})

function createPublishedResult(sequence: number): UpdateResult {
  return {
    status: 'published',
    revision: `r${sequence}`,
    timings: [],
    stages: {
      typecheck: { stage: 'typecheck', status: 'skipped' },
      fix: { stage: 'fix', status: 'skipped' },
      check: { stage: 'check', status: 'skipped' },
    },
  }
}
