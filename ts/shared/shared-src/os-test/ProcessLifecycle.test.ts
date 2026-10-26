import { Http, Lifecycle, Tests } from '@shared/os'

Tests.test('explicit shutdown resolves its wait without finishing another session', async () => {
  const first = Http.createAbortController()
  const second = Http.createAbortController()
  const firstWait = Lifecycle.waitForTermination(first.signal)
  let secondFinished = false
  const secondWait = Lifecycle.waitForTermination(second.signal).then(() => {
    secondFinished = true
  })
  first.abort()
  await firstWait
  Tests.expect(secondFinished).toBe(false)
  second.abort()
  await secondWait
  Tests.expect(secondFinished).toBe(true)
  await Lifecycle.waitForTermination(first.signal)
})
