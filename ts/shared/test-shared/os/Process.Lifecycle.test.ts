import * as Tests from '@shared-tests'
import { Http, Process } from '@shared/os'

Tests.test('explicit shutdown resolves its wait without finishing another session', async () => {
  const first = Http.createAbortController()
  const second = Http.createAbortController()
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
