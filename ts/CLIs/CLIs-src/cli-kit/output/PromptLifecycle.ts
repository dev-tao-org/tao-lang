import { Errors, Try } from '@shared'

/** createPromptLifecycle suspends a terminal renderer for one prompt and rejects overlapping readers. */
export function createPromptLifecycle(operations: {
  suspend: () => Promise<boolean>
  resume: () => Promise<void>
  reportResumeFailure: (error: unknown) => void
}) {
  let promptActive = false
  let suspended = false
  let transition = Promise.resolve()
  return {
    run: <T>(prompt: () => Promise<T>) => beginPrompt(prompt),
  }

  async function beginPrompt<T>(prompt: () => Promise<T>): Promise<T> {
    if (promptActive) {
      Errors.ThrowUnexpected('Another prompt is active. Wait for it to finish before starting another prompt.')
    }
    promptActive = true
    enqueue(async () => {
      suspended = await operations.suspend() || suspended
    })
    return await runPrompt(prompt, transition, finishPrompt, operations.reportResumeFailure, () => {
      promptActive = false
    })
  }

  async function finishPrompt(): Promise<CleanupResult> {
    const finish = enqueue(async () => {
      if (suspended) {
        await operations.resume()
        suspended = false
      }
    })
    return await Try(async () => {
      await finish
      return { failed: false }
    }, {
      catch: error => ({ failed: true, error }),
    })
  }

  function enqueue(operation: () => Promise<void>): Promise<void> {
    transition = transition.then(operation, operation)
    return transition
  }
}

type CleanupResult = { failed: false } | { failed: true; error: unknown }

async function runPrompt<T>(
  prompt: () => Promise<T>,
  start: Promise<void>,
  finish: () => Promise<CleanupResult>,
  reportResumeFailure: (error: unknown) => void,
  complete: () => void,
): Promise<T> {
  let promptFailed = false
  let promptError: unknown
  let cleanup: CleanupResult = { failed: false }
  const result = await Try(async () => {
    await start
    return await prompt()
  }, {
    catch(error) {
      promptFailed = true
      promptError = error
    },
    async finally() {
      cleanup = await finish()
      complete()
    },
  })
  return resolvePromptResult(result, promptFailed, promptError, cleanup, reportResumeFailure)
}

function resolvePromptResult<T>(
  result: T | void,
  promptFailed: boolean,
  promptError: unknown,
  cleanup: CleanupResult,
  reportResumeFailure: (error: unknown) => void,
): T {
  if (promptFailed && cleanup.failed) {
    reportResumeFailure(cleanup.error)
  }
  if (promptFailed) {
    Errors.Throw(promptError)
  }
  if (cleanup.failed) {
    Errors.Throw(cleanup.error)
  }
  return result as T
}
