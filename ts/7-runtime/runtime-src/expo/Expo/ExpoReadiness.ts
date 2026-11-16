import { Errors, Time, Try } from '@shared'
import * as ExternalErrors from '@shared/errors/external'
import { Cancellation, Http } from '@shared/web'

/** waitForExpoReady polls a local server while bounding each request by its remaining deadline. */
export async function waitForExpoReady(
  url: string,
  isRunning: () => boolean,
  request: typeof Http.request = Http.request,
  timeoutMs = 90_000,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Time.nowMs() + timeoutMs
  while (Time.nowMs() < deadline) {
    if (signal?.aborted) {
      Errors.ThrowHostEnvironment('Expo startup interrupted.')
    }
    if (!isRunning()) {
      Errors.ThrowHostEnvironment('Expo exited before becoming ready.')
    }
    const remainingMs = deadline - Time.nowMs()
    const response = await Try.WithDefault(undefined, () => requestBeforeDeadline(url, remainingMs, request, signal))
    if (signal?.aborted) {
      Errors.ThrowHostEnvironment('Expo startup interrupted.')
    }
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
  signal?: AbortSignal,
): Promise<Http.HttpResponse> {
  const controller = Cancellation.createController()
  let abort!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      controller.abort()
      reject(ExternalErrors.fromUnknown(new Error('Expo startup interrupted.')))
    }
  })
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) {
    abort()
  }
  let cancelTimer!: () => void
  const timeout = new Promise<never>((_resolve, reject) => {
    cancelTimer = Time.schedule(remainingMs, () => {
      controller.abort()
      reject(ExternalErrors.fromUnknown(new Error('Expo readiness request exceeded its deadline.')))
    })
  })
  return await Try(
    () => Promise.race([request(url, { signal: controller.signal }), timeout, cancelled]),
    {
      finally() {
        cancelTimer()
        signal?.removeEventListener('abort', abort)
      },
    },
  )
}
