import * as Tests from '@shared-tests'

import { formatTimings } from '../../CLIs-src/cli-kit/timing-output'

Tests.test('compile checkpoints show step duration and cumulative elapsed seconds', () => {
  const formatted = formatTimings([
    { name: 'workspace.queue', role: 'observation', clock: 'test', startMs: 1000, durationMs: 5, status: 'succeeded' },
    { name: 'parser.parse', role: 'leaf', clock: 'test', startMs: 1005, durationMs: 20, status: 'succeeded' },
  ])
  Tests.expect(formatted).toBe('queue: 5.00 ms (0.0050 s elapsed)\n  parse: 20.00 ms (0.0250 s elapsed)')
})
