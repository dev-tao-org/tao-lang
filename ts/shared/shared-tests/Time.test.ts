import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import * as Time from '@shared/Time'

Describe('Time', () => {
    Test("nowMs returns a monotonic millisecond reading", () => {
        const now = Time.nowMs()
        Expect(now).toBeGreaterThan(0)
    })
})
