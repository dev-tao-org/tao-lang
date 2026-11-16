import * as Tests from '@shared-tests'
import { describeTestBalance, describeTestTimings } from '../../CLIs-src/dev-cli/testing/TestBalance'

Tests.test('test balance warnings compare peer workers and recommend resource-efficient concurrent groups', () => {
  Tests.expect(describeTestBalance([
    { title: 'TypeScript', workerDurationsMs: [14_950, 16_230, 38_810] },
    { title: 'Tao', workerDurationsMs: [8580, 5130, 5140] },
  ], true)).toEqual([
    'TypeScript shards are unbalanced: 14.95s / 16.23s / 38.81s; spread 23.86s exceeds 5.00s (10% of mean, minimum 5s). Rebalance tests and/or create more shards within the available worker budget. Ignore contention-affected timings; confirm on repeated uncontended runs before changing allocation.',
    'Tao finishes much sooner than TypeScript: 8.58s versus 38.81s. Use fewer shards (3 → 1; estimated 18.85s) to free parallel resources for slower groups. Ignore contention-affected timings; confirm on repeated uncontended runs before changing allocation.',
  ])
  Tests.expect(describeTestBalance([
    { title: 'TypeScript', workerDurationsMs: [14_950, 16_230, 38_810] },
    { title: 'Tao', workerDurationsMs: [8580, 5130, 5140] },
  ], false)).toHaveLength(1)
})

Tests.test('balance tolerances retain strict absolute and 10-percent boundaries without cross-group skew', () => {
  Tests.expect(describeTestBalance([
    { title: 'absolute boundary', workerDurationsMs: [1000, 6000] },
    { title: 'relative boundary', workerDurationsMs: [95_000, 105_000] },
    { title: 'single worker', workerDurationsMs: [500_000] },
    { title: 'empty selection', workerDurationsMs: [] },
  ], false)).toEqual([])
  const warnings = describeTestBalance([
    { title: 'absolute exceeded', workerDurationsMs: [1000, 6001] },
    { title: 'relative exceeded', workerDurationsMs: [94_999, 105_001] },
  ], false)
  Tests.expect(warnings).toHaveLength(2)
  Tests.expect(warnings[1]).toContain('exceeds 10.00s (10% of mean, minimum 5s)')
  Tests.expect(describeTestBalance([
    { title: 'slow', workerDurationsMs: [40_000, 40_000] },
    { title: 'fast', workerDurationsMs: [12_000, 12_000, 12_000] },
  ], true)).toEqual([])
  Tests.expect(describeTestBalance([
    { title: 'slow', workerDurationsMs: [60_000, 60_000] },
    { title: 'fast', workerDurationsMs: [10_000, 10_000, 10_000, 10_000] },
  ], true)).toEqual([
    'fast finishes much sooner than slow: 10.00s versus 60.00s. Use fewer shards (4 → 2; estimated 20.00s) to free parallel resources for slower groups. Ignore contention-affected timings; confirm on repeated uncontended runs before changing allocation.',
  ])
})

Tests.test('test timing summaries always show peer spreads, including single workers and unavailable evidence', () => {
  const groups = [
    { title: 'TypeScript', workerDurationsMs: [20_000, 21_000, 22_000] },
    { title: 'Tao', workerDurationsMs: [12_000] },
  ]
  Tests.expect(describeTestTimings(groups, true)).toEqual([
    'TypeScript shard timings: 20.00s / 21.00s / 22.00s; spread 2.00s (9.5% of mean).',
    'Tao shard timings: 12.00s; spread 0.00s (0.0% of mean).',
  ])
  Tests.expect(describeTestTimings(groups, false)).toEqual([
    'TypeScript shard timings: 20.00s / 21.00s / 22.00s; spread unavailable (incomplete run).',
    'Tao shard timings: 12.00s; spread unavailable (incomplete run).',
  ])
  Tests.expect(describeTestTimings([{ title: 'TypeScript', workerDurationsMs: [] }], false)).toEqual([
    'Test shard timings: unavailable (no worker timings).',
  ])
})
