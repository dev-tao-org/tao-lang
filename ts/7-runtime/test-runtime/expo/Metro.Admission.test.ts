import { Try } from '@shared'
import * as Tests from '@shared-tests'

import { createMetroAdmission } from '../../runtime-src/expo/Metro/MetroAdmission'

Tests.test('publication drains delayed readers and every scheduled HMR group before admitting the next revision', async () => {
  const gate = createMetroAdmission()
  const reader = deferred()
  const firstGroup = deferred()
  const secondGroup = deferred()
  const events: string[] = []
  let visible = 'A'
  const initial = gate.read(async () => {
    events.push(visible)
    await reader.promise
    events.push(visible)
  })
  const publishing = gate.publish(async () => {
    visible = 'B'
    void gate.schedule(async () => {
      await firstGroup.promise
      events.push(`first:${visible}`)
    })
    void gate.schedule(async () => {
      await secondGroup.promise
      events.push(`second:${visible}`)
    })
    events.push('installed')
  })
  const attaching = gate.read(async () => {
    events.push(`attach:${visible}`)
  })
  await Promise.resolve()
  Tests.expect(events).toEqual(['A'])
  reader.resolve()
  await initial
  await Promise.resolve()
  Tests.expect(events).toEqual(['A', 'A', 'installed'])
  firstGroup.resolve()
  await Promise.resolve()
  Tests.expect(events).not.toContain('attach:B')
  secondGroup.resolve()
  await Promise.all([publishing, attaching])
  Tests.expect(events).toEqual(['A', 'A', 'installed', 'first:B', 'second:B', 'attach:B'])
})

Tests.test('handled publication errors reopen admission and poison rejects subsequent reads', async () => {
  const gate = createMetroAdmission()
  await Try(() => gate.publish(async () => Promise.reject('precommit')), { catch: () => undefined })
  Tests.expect(await gate.read(async () => 'repaired')).toBe('repaired')
  gate.poison()
  await Tests.expect(gate.read(async () => 'unsafe')).rejects.toThrow('restart')
})

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => resolve = done)
  return { promise, resolve }
}
