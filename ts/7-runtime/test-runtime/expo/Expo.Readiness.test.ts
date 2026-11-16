import { Time, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Cancellation, Http } from '@shared/web'
import { waitForExpoReady } from '../../runtime-src/expo/Expo/ExpoReadiness'

Tests.test('Expo readiness aborts a stalled request at the deadline', async () => {
  let aborted = false
  let failed = false
  const request: typeof Http.request = async (_url, init) =>
    await new Promise(resolve => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        resolve(Http.response())
      }, { once: true })
    })

  await Try(() => waitForExpoReady('http://127.0.0.1', () => true, request, 20), {
    catch() {
      failed = true
    },
  })

  Tests.expect(aborted).toBe(true)
  Tests.expect(failed).toBe(true)
})

Tests.test('Expo readiness rejects an OK response that arrives after the deadline', async () => {
  let failed = false
  const request: typeof Http.request = async () =>
    await new Promise(resolve => {
      Time.schedule(60, () => resolve(Http.response()))
    })

  await Try(() => waitForExpoReady('http://127.0.0.1', () => true, request, 20), {
    catch() {
      failed = true
    },
  })

  Tests.expect(failed).toBe(true)
})

Tests.test('interrupting Expo startup aborts its pending request instead of awaiting the startup deadline', async () => {
  const controller = Cancellation.createController()
  let requestAborted = false
  const request: typeof Http.request = async (_url, init) => {
    controller.abort()
    requestAborted = init?.signal?.aborted === true
    return await new Promise(() => {})
  }
  await Tests.expect(waitForExpoReady('http://127.0.0.1', () => true, request, 1000, controller.signal))
    .rejects.toThrow('interrupted')
  Tests.expect(requestAborted).toBe(true)
})
