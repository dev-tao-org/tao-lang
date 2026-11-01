/** createRetryableInitialization caches successful initialization and retries after failure. */
export function createRetryableInitialization<Arguments extends readonly unknown[], Result>(
  initialize: (...args: Arguments) => Promise<Result>,
): (...args: Arguments) => Promise<Result> {
  let promise: InitializationPromise<Result>
  return (...args) => {
    promise ??= Promise.resolve().then(() => initialize(...args)).catch(error => {
      promise = undefined
      return Promise.reject(error)
    })
    return promise
  }
}

type InitializationPromise<Result> = Promise<Result> | undefined
