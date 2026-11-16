import type * as Runtime from '@runtime'
import * as Tests from '@shared-tests'

import type * as Workspace from '@workspace'

import * as Preview from '@shared/preview'
import { PreviewPublication } from '../../repo-analysis-src/Performance/Preview/PreviewPublication'

Tests.test('a committed publication error reloads the actual served revision and retains its diagnostic', () => {
  const fixture = createPublicationFixture()
  fixture.expect('new')
  fixture.runtime.generated = { revision: 'new', sequence: 2, files: { 'App.tsx': 'new source' } }
  fixture.fail('new')
  verifyReloadBaseline(fixture.publication, { revision: 'new', sequence: 2 })
  Tests.expect(fixture.messages.at(-1)).toEqual({
    name: 'outcome',
    data: { revision: 'new', sequence: 2, kind: 'build-error', message: 'Publication failed' },
  })
  fixture.publication.dispose()
  Tests.expect(fixture.listeners.size).toBe(0)
})

Tests.test('a publication rejected before commit keeps the last served revision as its reload baseline', () => {
  const fixture = createPublicationFixture()
  fixture.expect('rejected')
  fixture.fail('rejected')
  verifyReloadBaseline(fixture.publication, { revision: 'initial', sequence: 1 })
  fixture.publication.dispose()
})

function createPublicationFixture() {
  const runtime: Runtime.RuntimeApplication = {
    directory: '/runtime',
    appPath: '/runtime/App.tsx',
    generated: { revision: 'initial', sequence: 1, files: { 'App.tsx': 'initial source' } },
  }
  const observation = createPublicationObservation()
  const workspace = { runtime, lastGoodRevision: 'initial', ...observation.workspace }
  const messages: { name: string; data: object }[] = []
  const publication = new PreviewPublication(
    workspace,
    (name, data) => messages.push({ name, data }),
    () => {},
    () => {},
  )
  return { runtime, publication, messages, ...observation }
}

function createPublicationObservation() {
  const listeners = new Set<(event: Workspace.CompiledEvent) => void>()
  const expectedListeners = new Set<(revision: string, startedAtMs: number) => void>()
  const publishedListeners = new Set<(publication: Workspace.Publication) => void>()
  const workspace = {
    onExpected(listener: (revision: string, startedAtMs: number) => void) {
      expectedListeners.add(listener)
      return () => expectedListeners.delete(listener)
    },
    onPublished(listener: (publication: Workspace.Publication) => void) {
      publishedListeners.add(listener)
      return () => publishedListeners.delete(listener)
    },
    files: {
      onCompiled(listener: (event: Workspace.CompiledEvent) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
  return {
    workspace,
    listeners,
    expect(revision: string) {
      for (const listener of expectedListeners) {
        listener(revision, 0)
      }
    },
    fail(revision: string) {
      for (const listener of listeners) {
        listener({ path: '/App.tao', source: '', version: 1, result: createFailure(revision) })
      }
    },
  }
}

type OptionalPreviewExpectation = Preview.PreviewExpectation | undefined

function verifyReloadBaseline(publication: PreviewPublication, expected: Preview.PreviewExpectation): void {
  let baseline: OptionalPreviewExpectation
  publication.replay((name, data) => {
    if (name === 'baseline') {
      baseline = data as Preview.PreviewExpectation
    }
  })
  Tests.expect(baseline).toEqual(expected)
  const tracker = new Preview.PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('fresh')
  tracker.expect(baseline!, 0)
  const accepted = tracker.receive({ sessionId: 'session', frameId: 'left', bootId: 'fresh' }, {
    ...expected,
    kind: 'applied',
  })
  Tests.expect(accepted).toBe(true)
  Tests.expect(tracker.snapshot().pending).toBe(0)
  Tests.expect(tracker.checkDeadline(100)).toBeUndefined()
}

function createFailure(revision: string): Workspace.UpdateResult {
  return {
    status: 'failed',
    revision,
    error: 'Publication failed',
    timings: [],
    stages: {
      typecheck: { stage: 'typecheck', status: 'skipped' },
      fix: { stage: 'fix', status: 'skipped' },
      check: { stage: 'check', status: 'skipped' },
    },
  }
}
