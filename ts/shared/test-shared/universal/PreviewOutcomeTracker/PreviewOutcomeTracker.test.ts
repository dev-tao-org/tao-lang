import * as Tests from '@shared-tests'

import { PreviewOutcomeTracker } from '../../../shared-src/universal/PreviewOutcomeTracker'

Tests.test('coalesced application covers older expectations and rejects retired instances', () => {
  const tracker = new PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('first')
  tracker.expect({ revision: 'a', sequence: 1 }, 0)
  tracker.expect({ revision: 'c', sequence: 3 }, 10)
  Tests.expect(tracker.receive({ sessionId: 'session', frameId: 'left', bootId: 'first' }, {
    revision: 'c',
    sequence: 3,
    kind: 'applied',
  })).toBe(true)
  Tests.expect(tracker.snapshot().pending).toBe(0)
  tracker.bindInstance('second')
  tracker.expect({ revision: 'd', sequence: 4 }, 20)
  Tests.expect(tracker.receive({ sessionId: 'session', frameId: 'left', bootId: 'first' }, {
    revision: 'd',
    sequence: 4,
    kind: 'applied',
  })).toBe(false)
  Tests.expect(tracker.snapshot().pending).toBe(1)
})

Tests.test('continuous edits retain the oldest uncovered deadline and permit only one automatic recovery', () => {
  const tracker = new PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('first')
  tracker.expect({ revision: 'a', sequence: 1 }, 0)
  tracker.expect({ revision: 'b', sequence: 2 }, 90)
  Tests.expect(tracker.checkDeadline(100)).toBe('reload')
  tracker.bindInstance('second')
  tracker.expect({ revision: 'b', sequence: 2 }, 100)
  Tests.expect(tracker.checkDeadline(200)).toBe('failed')
  tracker.manualRecovery()
  tracker.bindInstance('third')
  tracker.expect({ revision: 'b', sequence: 2 }, 200)
  Tests.expect(tracker.checkDeadline(300)).toBe('reload')
})

Tests.test('explicit failures and no-op terminate without rendering and retain diagnostics through repair', () => {
  const tracker = new PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('first')
  tracker.expect({ revision: 'a', sequence: 1 }, 0)
  tracker.terminal({ revision: 'a', sequence: 1, kind: 'build-error', message: 'Broken import' })
  Tests.expect(tracker.checkDeadline(200)).toBeUndefined()
  Tests.expect(tracker.snapshot().diagnostics).toEqual(['Broken import'])
  tracker.expect({ revision: 'b', sequence: 2 }, 200)
  tracker.terminal({ revision: 'b', sequence: 2, kind: 'noop' })
  Tests.expect(tracker.snapshot().pending).toBe(0)
  Tests.expect(tracker.snapshot().diagnostics).toEqual(['Broken import'])
})

Tests.test('reported errors never trigger automatic timeout recovery and corrections remain usable', () => {
  const tracker = new PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('first')
  tracker.expect({ revision: 'a', sequence: 1 }, 0)
  tracker.reportError('Evaluation failed')
  Tests.expect(tracker.checkDeadline(1000)).toBeUndefined()
  tracker.expect({ revision: 'b', sequence: 2 }, 1000)
  Tests.expect(tracker.receive({ sessionId: 'session', frameId: 'left', bootId: 'first' }, {
    revision: 'b',
    sequence: 2,
    kind: 'applied',
  })).toBe(true)
  Tests.expect(tracker.snapshot().error).toBeUndefined()
  Tests.expect(tracker.snapshot().diagnostics).toEqual(['Evaluation failed'])
})

Tests.test('partial application retains the original deadline of the oldest remaining revision', () => {
  const tracker = new PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('first')
  tracker.expect({ revision: 'a', sequence: 1 }, 0)
  tracker.expect({ revision: 'b', sequence: 2 }, 10)
  tracker.receive({ sessionId: 'session', frameId: 'left', bootId: 'first' }, {
    revision: 'a',
    sequence: 1,
    kind: 'applied',
  })
  Tests.expect(tracker.snapshot().deadline).toBe(110)
  tracker.expect({ revision: 'c', sequence: 3 }, 100)
  Tests.expect(tracker.checkDeadline(110)).toBe('reload')
})

Tests.test('a newer no-op or superseded publication cannot cover an earlier delivered update', () => {
  const tracker = new PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('first')
  tracker.expect({ revision: 'a', sequence: 1 }, 0)
  tracker.expect({ revision: 'b', sequence: 2 }, 10)
  tracker.expect({ revision: 'c', sequence: 3 }, 20)
  tracker.terminal({ revision: 'b', sequence: 2, kind: 'superseded' })
  tracker.terminal({ revision: 'c', sequence: 3, kind: 'noop' })
  Tests.expect(tracker.snapshot().pending).toBe(1)
  Tests.expect(tracker.checkDeadline(100)).toBe('reload')
})

Tests.test('a reported later error cancels earlier waits without application and corrections start a fresh deadline', () => {
  const tracker = new PreviewOutcomeTracker('session', 'left', 100)
  tracker.bindInstance('first')
  tracker.expect({ revision: 'a', sequence: 1 }, 0)
  tracker.expect({ revision: 'b', sequence: 2 }, 50)
  tracker.terminal({ revision: 'b', sequence: 2, kind: 'runtime-error', message: 'Render failed' })
  Tests.expect(tracker.checkDeadline(1000)).toBeUndefined()
  Tests.expect(tracker.snapshot().latestApplied).toBe(-1)
  tracker.expect({ revision: 'c', sequence: 3 }, 1000)
  Tests.expect(tracker.snapshot().deadline).toBe(1100)
  Tests.expect(tracker.checkDeadline(1099)).toBeUndefined()
  Tests.expect(tracker.checkDeadline(1100)).toBe('reload')
  Tests.expect(tracker.snapshot().diagnostics).toEqual([
    'Render failed',
    'Preview did not acknowledge its update before the deadline.',
  ])
})
