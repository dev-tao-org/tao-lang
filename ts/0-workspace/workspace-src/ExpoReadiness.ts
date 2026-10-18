import { Errors, Time, Try } from '@shared'
import { Http } from '@shared/os'

/** waitForExpoReady polls a local server while bounding each request by its remaining deadline. */
export async function waitForExpoReady(
  url: string,
  isRunning: () => boolean,
  request: typeof Http.request = Http.request,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Time.nowMs() + timeoutMs
  while (Time.nowMs() < deadline) {
    if (!isRunning()) {
      Errors.ThrowHostEnvironment('Expo exited before becoming ready.')
    }
    const remainingMs = deadline - Time.nowMs()
    const response = await Try(() => requestBeforeDeadline(url, remainingMs, request), {
      catch() {
        return undefined
      },
    })
    if (response?.ok && Time.nowMs() < deadline) {
      return
    }
    if (Time.nowMs() < deadline) {
      await Time.sleep(Math.min(250, deadline - Time.nowMs()))
    }
  }
  Errors.ThrowHostEnvironment(`Expo did not become ready within ${Math.ceil(timeoutMs / 1000)} seconds.`)
}

async function requestBeforeDeadline(
  url: string,
  remainingMs: number,
  request: typeof Http.request,
): Promise<Http.HttpResponse> {
  const controller = Http.createAbortController()
  let cancelTimer!: () => void
  const timeout = new Promise<never>((_resolve, reject) => {
    cancelTimer = Time.schedule(remainingMs, () => {
      controller.abort()
      reject(Errors.fromUnknown(new Error('Expo readiness request exceeded its deadline.')))
    })
  })
  return await Try(
    () => Promise.race([request(url, { signal: controller.signal }), timeout]),
    {
      finally() {
        cancelTimer()
      },
    },
  )
}
