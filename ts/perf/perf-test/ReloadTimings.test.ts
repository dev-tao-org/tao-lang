import { Tests } from '@shared/os'
import { type ReloadTiming, ReloadTimings } from '../perf-src/ReloadTimings'

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
  reload.published({ revision: 'r2', startedAtMs: 1000, publishedAtMs: 1010, timings: [] })
  Tests.expect(reported).toEqual([{
    revision: 'r2',
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

function signal(frameId: string, type: string, timestampMs: number, revision = 'r2') {
  return { sessionId: 'session', frameId, bootId: frameId, type, timestampMs, revision }
}
