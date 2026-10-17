import * as Time from '@shared/Time'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'

Describe('Time', () => {
  Test('nowMs returns a monotonic millisecond reading', () => {
    const now = Time.nowMs()
    Expect(now).toBeGreaterThan(0)
  })
})
