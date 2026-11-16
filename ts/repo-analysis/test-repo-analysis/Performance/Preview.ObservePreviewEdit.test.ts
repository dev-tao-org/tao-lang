import { Try } from '@shared'
import * as Tests from '@shared-tests'

import type * as Workspace from '@workspace'
import { Document } from '@workspace'

import { observePreviewEdit } from '../../repo-analysis-src/Performance/Preview/ObservePreviewEdit'

Tests.test('a serialized edit waits for a fresh latest nonsuperseded completion with its exact path and source', async () => {
  const fixture = createCompletionFixture()
  const observation = observePreviewEdit(fixture.files, '/App.tao', 'new', fixture.pending)
  let settled = false
  void observation.result.then(() => settled = true)
  await Try(async () => {
    fixture.document.replaceSource('new')
    await expectIgnored(
      fixture,
      { path: '/App.tao', source: 'new', version: 1, result: createResult('published') },
      () => settled,
    )
    await expectIgnored(
      fixture,
      { path: '/Other.tao', source: 'new', version: 2, result: createResult('published') },
      () => settled,
    )
    await expectIgnored(
      fixture,
      { path: '/App.tao', source: 'unrelated', version: 2, result: createResult('published') },
      () => settled,
    )
    await expectIgnored(
      fixture,
      { path: '/App.tao', source: 'new', version: 2, result: createResult('superseded') },
      () => settled,
    )
    fixture.document.replaceSource('new')
    await expectIgnored(
      fixture,
      { path: '/App.tao', source: 'new', version: 2, result: createResult('published') },
      () => settled,
    )
    fixture.emit({ path: '/App.tao', source: 'new', version: 3, result: createResult('published') })
    Tests.expect((await observation.result).status).toBe('published')
  }, { finally: observation.dispose })
  Tests.expect(fixture.listeners.size).toBe(0)
  Tests.expect(fixture.pending.size).toBe(0)
})

Tests.test('a fresh matching compiler failure is terminal and preserves the failure diagnostic', async () => {
  const fixture = createCompletionFixture()
  const observation = observePreviewEdit(fixture.files, '/App.tao', 'new', fixture.pending)
  await Try(async () => {
    fixture.document.replaceSource('new')
    fixture.emit({ path: '/App.tao', source: 'new', version: 2, result: createResult('failed') })
    const completed = await observation.result
    Tests.expect(completed.status).toBe('failed')
    Tests.expect(completed.status === 'failed' && completed.error).toBe('Deliberate compiler failure')
  }, { finally: observation.dispose })
})

Tests.test('edit observation timeout and harness disposal reject without leaving active subscriptions', async () => {
  const fixture = createCompletionFixture()
  const timeout = observePreviewEdit(fixture.files, '/App.tao', 'new', fixture.pending, 1)
  await Try(async () => {
    await Tests.expect(timeout.result).rejects.toThrow('Saved source was not observed')
  }, { finally: timeout.dispose })
  const closing = observePreviewEdit(fixture.files, '/App.tao', 'new', fixture.pending)
  for (const abort of fixture.pending) {
    abort()
  }
  await Tests.expect(closing.result).rejects.toThrow('Preview harness closed')
  Tests.expect(fixture.listeners.size).toBe(0)
  Tests.expect(fixture.pending.size).toBe(0)
})

function createCompletionFixture() {
  const document = new Document('/App.tao')
  document.replaceSource('old')
  const listeners = new Set<(event: Workspace.CompiledEvent) => void>()
  const pending = new Set<() => void>()
  return {
    document,
    listeners,
    pending,
    files: {
      getDocument: (_path: string) => document,
      onCompiled(listener: (event: Workspace.CompiledEvent) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    emit(event: Workspace.CompiledEvent) {
      for (const listener of listeners) {
        listener(event)
      }
    },
  }
}

type CompletionFixture = {
  document: Document
  listeners: Set<(event: Workspace.CompiledEvent) => void>
  pending: Set<() => void>
  files: {
    getDocument(path: string): Document
    onCompiled(listener: (event: Workspace.CompiledEvent) => void): () => boolean
  }
  emit(event: Workspace.CompiledEvent): void
}

async function expectIgnored(
  fixture: CompletionFixture,
  event: Workspace.CompiledEvent,
  hasSettled: () => boolean,
): Promise<void> {
  fixture.emit(event)
  await Promise.resolve()
  Tests.expect(hasSettled()).toBe(false)
}

function createResult(status: Workspace.UpdateResult['status']): Workspace.UpdateResult {
  const fields = {
    revision: 'r1',
    timings: [],
    stages: {
      typecheck: { stage: 'typecheck', status: 'skipped' },
      fix: { stage: 'fix', status: 'skipped' },
      check: { stage: 'check', status: 'skipped' },
    },
  } as const
  return status === 'failed'
    ? { ...fields, timings: [], status, error: 'Deliberate compiler failure' }
    : { ...fields, timings: [], status }
}
