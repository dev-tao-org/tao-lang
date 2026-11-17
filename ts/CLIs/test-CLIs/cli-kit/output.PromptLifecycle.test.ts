import { Errors, UserInput } from '@shared'
import * as Tests from '@shared-tests'

import { createPromptLifecycle } from '../../CLIs-src/cli-kit/output/PromptLifecycle'

Tests.test('rejects a nested prompt clearly and resumes the outer prompt', async () => {
  const events: string[] = []
  const lifecycle = createPromptLifecycle({
    async suspend() {
      events.push('suspend')
      return true
    },
    async resume() {
      events.push('resume')
    },
    reportResumeFailure() {},
  })
  await lifecycle.run(async () => {
    events.push('prompt')
    await Tests.expect(lifecycle.run(async () => {
      events.push('nested prompt')
    }))
      .rejects.toThrow('Another prompt is active. Wait for it to finish before starting another prompt.')
  })
  Tests.expect(events).toEqual(['suspend', 'prompt', 'resume'])
  await Tests.expect(lifecycle.run(async () => {
    throw new Error('prompt failed')
  })).rejects.toThrow()
  Tests.expect(events).toEqual(['suspend', 'prompt', 'resume', 'suspend', 'resume'])
})

Tests.test('rejects an overlapping prompt and leaves the first and later prompts usable', async () => {
  const events: string[] = []
  const enteredFirst = deferred<void>()
  const finishFirst = deferred<void>()
  const lifecycle = createPromptLifecycle({
    async suspend() {
      events.push('suspend')
      return true
    },
    async resume() {
      events.push('resume')
    },
    reportResumeFailure() {},
  })
  const first = lifecycle.run(async () => {
    events.push('first')
    enteredFirst.resolve()
    await finishFirst.promise
  })
  await enteredFirst.promise
  await Tests.expect(lifecycle.run(async () => {
    events.push('rejected prompt')
  }))
    .rejects.toThrow('Another prompt is active. Wait for it to finish before starting another prompt.')
  Tests.expect(events).toEqual(['suspend', 'first'])
  finishFirst.resolve()
  await first
  await lifecycle.run(async () => {
    events.push('later prompt')
  })
  Tests.expect(events).toEqual(['suspend', 'first', 'resume', 'suspend', 'later prompt', 'resume'])
})

Tests.test('rejects a prompt while the renderer is restoring', async () => {
  const events: string[] = []
  const resumeStarted = deferred<void>()
  const finishResume = deferred<void>()
  let resumes = 0
  const lifecycle = createPromptLifecycle({
    async suspend() {
      events.push('suspend')
      return true
    },
    async resume() {
      resumes++
      events.push(`resume ${resumes} started`)
      if (resumes === 1) {
        resumeStarted.resolve()
        await finishResume.promise
      }
      events.push(`resume ${resumes} finished`)
    },
    reportResumeFailure() {},
  })
  const first = lifecycle.run(async () => {
    events.push('first prompt')
  })
  await resumeStarted.promise
  await Tests.expect(lifecycle.run(async () => {
    events.push('rejected prompt')
  }))
    .rejects.toThrow('Another prompt is active. Wait for it to finish before starting another prompt.')
  Tests.expect(events).not.toContain('rejected prompt')
  finishResume.resolve()
  await first
  await lifecycle.run(async () => {
    events.push('later prompt')
  })
  Tests.expect(events).toEqual([
    'suspend',
    'first prompt',
    'resume 1 started',
    'resume 1 finished',
    'suspend',
    'later prompt',
    'resume 2 started',
    'resume 2 finished',
  ])
})

Tests.test('reports suspend failure without running the prompt and retries the next prompt', async () => {
  const events: string[] = []
  let suspends = 0
  const lifecycle = createPromptLifecycle({
    async suspend() {
      suspends++
      events.push(`suspend ${suspends}`)
      if (suspends === 1) {
        Errors.ThrowShouldNeverHappen('suspend failed')
      }
      return true
    },
    async resume() {
      events.push('resume')
    },
    reportResumeFailure() {},
  })
  await Tests.expect(lifecycle.run(async () => {
    events.push('prompt')
  })).rejects.toThrow('suspend failed')
  Tests.expect(events).toEqual(['suspend 1'])
  await lifecycle.run(async () => {
    events.push('prompt retry')
  })
  Tests.expect(events).toEqual(['suspend 1', 'suspend 2', 'prompt retry', 'resume'])
})

Tests.test('reports resume failure and retries the renderer on a later prompt', async () => {
  const events: string[] = []
  let resumes = 0
  const lifecycle = createPromptLifecycle({
    async suspend() {
      events.push('suspend')
      return true
    },
    async resume() {
      resumes++
      events.push(`resume ${resumes}`)
      if (resumes === 1) {
        Errors.ThrowShouldNeverHappen('resume failed')
      }
    },
    reportResumeFailure() {},
  })
  await Tests.expect(lifecycle.run(async () => {
    events.push('prompt 1')
  })).rejects.toThrow('resume failed')
  await lifecycle.run(async () => {
    events.push('prompt 2')
  })
  Tests.expect(events).toEqual(['suspend', 'prompt 1', 'resume 1', 'suspend', 'prompt 2', 'resume 2'])
})

Tests.test('keeps the prompt failure primary while exposing a failed renderer recovery', async () => {
  const reported: unknown[] = []
  const lifecycle = createPromptLifecycle({
    suspend: async () => true,
    async resume() {
      Errors.ThrowShouldNeverHappen('renderer resume failed')
    },
    reportResumeFailure(error) {
      reported.push(error)
    },
  })
  await Tests.expect(lifecycle.run(async () => UserInput.Fail('primary prompt failure'))).rejects.toMatchObject({
    name: 'UserInputError',
    messageForUser: 'primary prompt failure',
  })
  Tests.expect(Errors.isTaoError(reported[0])).toBe(true)
  Tests.expect((reported[0] as Errors.TaoError).messageForUser).toBe('renderer resume failed')
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
