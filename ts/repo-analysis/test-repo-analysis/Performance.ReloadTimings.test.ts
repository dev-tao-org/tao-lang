import * as Tests from '@shared-tests'

import { type ReloadTiming, ReloadTimings } from '../repo-analysis-src/Performance/ReloadTimings'

Tests.test('reload output waits for both matching previews and measures from the observed save', () => {
  const reported: ReloadTiming[] = []
  const reload = new ReloadTimings('session', timing => reported.push(timing))
  reload.begin('r1', 900)
  reload.begin('r2', 1000)
  reload.receive(signal('left', 'tao.update-done', 1080, 'r1'))
  reload.receive(signal('left', 'tao.preview-applied', 1110))
  reload.receive(signal('right', 'tao.update-done', 1085))
  reload.receive(signal('right', 'tao.preview-applied', 1115))
  Tests.expect(reported).toEqual([])
  reload.receive(signal('left', 'tao.update-done', 1080))
  Tests.expect(reported).toEqual([])
  reload.published({
    revision: 'r2',
    startedAtMs: 1000,
    publicationStartedAtMs: 1010,
    publishedAtMs: 1120,
    timings: [],
  })
  Tests.expect(reported).toEqual([{
    revision: 'r2',
    observedAtMs: 1000,
    saveToHmrMs: 85,
    saveToAppliedMs: 115,
    pipeline: [],
    frames: {
      left: { publishToHmrMs: 70, hmrToAppliedMs: 30, saveToHmrMs: 80, saveToAppliedMs: 110 },
      right: { publishToHmrMs: 75, hmrToAppliedMs: 30, saveToHmrMs: 85, saveToAppliedMs: 115 },
    },
  }])
  reload.receive(signal('left', 'tao.preview-applied', 1200))
  Tests.expect(reported).toHaveLength(1)
})

Tests.test('reload receipts replace stale milestones when a preview reboots', () => {
  const reported: ReloadTiming[] = []
  const reload = new ReloadTimings('session', timing => reported.push(timing))
  reload.begin('r1', 1000)
  reload.receive(signal('left', 'tao.update-done', 1050, 'r1', 'boot-a'))
  reload.receive(signal('left', 'tao.preview-applied', 1100, 'r1', 'boot-b'))
  reload.receive(signal('right', 'tao.update-done', 1080, 'r1', 'boot-right'))
  reload.receive(signal('right', 'tao.preview-applied', 1110, 'r1', 'boot-right'))
  reload.published({
    revision: 'r1',
    startedAtMs: 1000,
    publicationStartedAtMs: 1010,
    publishedAtMs: 1120,
    timings: [],
  })
  Tests.expect(reported).toEqual([])

  reload.receive(signal('left', 'tao.update-done', 1200, 'r1', 'boot-a'))
  reload.receive(signal('left', 'tao.update-done', 1090, 'r1', 'boot-b'))
  Tests.expect(reported).toHaveLength(1)
  Tests.expect(reported[0]?.frames.left?.hmrToAppliedMs).toBe(10)

  reload.receive(signal('left', 'tao.preview-applied', 1070, 'r1', 'boot-a'))
  Tests.expect(reported).toHaveLength(1)
  Tests.expect(reported[0]?.frames.left?.saveToHmrMs).toBe(90)
})

Tests.test('single preview reporting requires its configured frame and ignores unrelated peers', () => {
  const reported: ReloadTiming[] = []
  const reload = new ReloadTimings('session', timing => reported.push(timing), ['left'])
  reload.begin('r2', 1000)
  reload.published({
    revision: 'r2',
    startedAtMs: 1000,
    publicationStartedAtMs: 1010,
    publishedAtMs: 1090,
    timings: [],
  })
  reload.receive(signal('right', 'tao.update-done', 1050))
  reload.receive(signal('right', 'tao.preview-applied', 1060))
  Tests.expect(reported).toEqual([])
  reload.receive(signal('left', 'tao.update-done', 1070))
  Tests.expect(reported).toEqual([])
  reload.receive(signal('left', 'tao.preview-applied', 1080))
  Tests.expect(reported).toHaveLength(1)
  Tests.expect(reported[0]!.frames).toEqual({
    left: { publishToHmrMs: 60, hmrToAppliedMs: 10, saveToHmrMs: 70, saveToAppliedMs: 80 },
  })
})

function signal(frameId: string, type: string, timestampMs: number, revision = 'r2', bootId = frameId) {
  return { sessionId: 'session', frameId, bootId, type, timestampMs, revision }
}
