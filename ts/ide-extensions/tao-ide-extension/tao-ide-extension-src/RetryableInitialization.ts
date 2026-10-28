/** createRetryableInitialization caches successful initialization and retries after failure. */
export function createRetryableInitialization<Arguments extends readonly unknown[], Result>(
  initialize: (...arguments_: Arguments) => Promise<Result>,
): (...arguments_: Arguments) => Promise<Result> {
  let promise: InitializationPromise<Result>
  return (...arguments_) => {
    promise ??= Promise.resolve().then(() => initialize(...arguments_)).catch(error => {
      promise = undefined
      return Promise.reject(error)
    })
    return promise
  }
}

type InitializationPromise<Result> = Promise<Result> | undefined
