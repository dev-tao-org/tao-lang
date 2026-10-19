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
  })
  const first = lifecycle.run(async () => {
    events.push('first prompt')
  })
  await resumeStarted.promise
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
