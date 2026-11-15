import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Browser, FS, Platform, Repo } from '@shared/os'

import { PreviewOpening } from '../perf-src/Preview/PreviewOpening'
import type { PreviewSignal } from '../perf-src/Preview/PreviewSignal'

Tests.test('preview harness bundles with browser-only platform APIs', async () => {
  const directory = Artifacts.resolvePath('tmp', `preview-bundle-${Platform.randomUUID()}`)
  await Try(async () => {
    const build = await Browser.build([Repo.resolvePath('ts/perf/perf-src/preview-browser.ts')], directory)
    Tests.expect(build.logs.map(log => log.message)).toEqual([])
    Tests.expect(build.success).toBe(true)
  }, {
    async finally() {
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
})

Tests.test('measured opening preserves first current-frame receipts when publication delivery is delayed', () => {
  const initial = { revision: 'initial', sequence: 1 }
  const published = { revision: 'published', sequence: 2 }
  const opening = new PreviewOpening(10, 2)
  const left = appliedFrame('left', 'left-boot')
  const right = appliedFrame('right', 'right-boot')
  const isCurrentFrame = (signal: PreviewSignal) => signal.bootId.endsWith('-boot')
  opening.recordApplied(left, 21)
  opening.recordApplied(right, 24)
  opening.recordApplied(right, 50)
  Tests.expect(opening.measureCompletion(initial, isCurrentFrame)).toBeUndefined()
  Tests.expect(opening.measureCompletion(published, isCurrentFrame)).toBe(14)
  opening.recordApplied(appliedFrame('right', 'retired'), 64)
  Tests.expect(opening.measureCompletion(published, isCurrentFrame)).toBeUndefined()
})

function appliedFrame(frameId: string, bootId: string): PreviewSignal {
  return {
    type: 'tao.preview-applied',
    sessionId: 'preview-session',
    frameId,
    bootId,
    revision: 'published',
    timestampMs: 0,
    timings: [],
  }
}
