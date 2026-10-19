import { Try } from '@shared'

/** createPromptLifecycle suspends a terminal renderer for the full duration of nested prompts. */
export function createPromptLifecycle(operations: {
  suspend: () => Promise<boolean>
  resume: () => Promise<void>
}) {
  let activePrompts = 0
  let suspended = false
  let transition = Promise.resolve()
  return {
    run<T>(prompt: () => Promise<T>): Promise<T> {
      if (activePrompts === 0) {
        transition = transition.then(async () => {
          suspended = await operations.suspend()
        })
      }
      activePrompts++
      const start = transition
      return Try(async () => {
        await start
        return await prompt()
      }, {
        async finally() {
          activePrompts--
          if (activePrompts === 0) {
            const finish = transition.then(async () => {
              if (suspended) {
                await operations.resume()
                suspended = false
              }
            })
            transition = finish
            await finish
          }
        },
      })
    },
  }
}
