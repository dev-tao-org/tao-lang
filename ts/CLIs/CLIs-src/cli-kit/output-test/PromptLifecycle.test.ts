import { Errors, Time } from '@shared'
import { Tests } from '@shared/os'
import { createPromptLifecycle } from '../output/PromptLifecycle'

Tests.test('suspends once around nested prompts and resumes after success or failure', async () => {
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
    await lifecycle.run(async () => {
      events.push('nested prompt')
    })
  })
  Tests.expect(events).toEqual(['suspend', 'prompt', 'nested prompt', 'resume'])
  await Tests.expect(lifecycle.run(async () => {
    throw new Error('prompt failed')
  })).rejects.toThrow()
  Tests.expect(events).toEqual(['suspend', 'prompt', 'nested prompt', 'resume', 'suspend', 'resume'])
})

Tests.test('keeps the renderer suspended until overlapping prompts have all ended', async () => {
  const events: string[] = []
  const finishFirst = deferred<void>()
  const finishSecond = deferred<void>()
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
    await finishFirst.promise
  })
  const second = lifecycle.run(async () => {
    events.push('second')
    await finishSecond.promise
  })
  await Promise.resolve()
  finishFirst.resolve()
  await first
  Tests.expect(events).toEqual(['suspend', 'first', 'second'])
  finishSecond.resolve()
  await second
  Tests.expect(events).toEqual(['suspend', 'first', 'second', 'resume'])
})

Tests.test('waits for an in-flight resume before suspending for a new prompt', async () => {
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
  await Promise.race([resumeStarted.promise, Time.sleep(50)])
  const second = lifecycle.run(async () => {
    events.push('second prompt')
  })
  Tests.expect(events).not.toContain('second prompt')
  finishResume.resolve()
  await Promise.all([first, second])
  Tests.expect(events).toEqual([
    'suspend',
    'first prompt',
    'resume 1 started',
    'resume 1 finished',
    'suspend',
    'second prompt',
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
        Errors.ThrowUnexpected('suspend failed')
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
        Errors.ThrowUnexpected('resume failed')
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
      Errors.ThrowUnexpected('renderer resume failed')
    },
    reportResumeFailure(error) {
      reported.push(error)
    },
  })
  await Tests.expect(lifecycle.run(async () => Errors.ThrowUserInput('primary prompt failure'))).rejects.toMatchObject({
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
