import * as Tests from '@shared-tests'
import { Process } from '@shared/os'
import { Cancellation } from '@shared/web'

Tests.test('explicit shutdown resolves its wait without finishing another session', async () => {
  const first = Cancellation.createController()
  const second = Cancellation.createController()
  const firstWait = Process.waitForTermination(first.signal)
  let secondFinished = false
  const secondWait = Process.waitForTermination(second.signal).then(() => {
    secondFinished = true
  })
  first.abort()
  await firstWait
  Tests.expect(secondFinished).toBe(false)
  second.abort()
  await secondWait
  Tests.expect(secondFinished).toBe(true)
  await Process.waitForTermination(first.signal)
})
