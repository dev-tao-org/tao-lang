import { Errors } from '@shared'
import { Tests } from '@shared/os'
import * as ExternalErrors from '../../../shared/shared-src/universal/Errors/external'
import { createCommandRunners } from '../cli-kit/CommandInteraction'
import { createPromptLifecycle } from '../cli-kit/output/PromptLifecycle'

Tests.test('interactive command execution hands off the terminal and restores it after success or failure', async () => {
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
  const failure = ExternalErrors.fromUnknown(new Error('command failed'))
  const runners = createCommandRunners({
    isInteractive: () => true,
    prompt: lifecycle.run,
    async execute(command, _options, mode) {
      events.push(`${command}:${mode}`)
      if (command === 'fail') {
        Errors.Throw(failure)
      }
    },
  })
  await runners.runInteractiveCommand('pass')
  await Tests.expect(runners.runInteractiveCommand('fail')).rejects.toBe(failure)
  Tests.expect(events).toEqual([
    'suspend',
    'pass:interactive',
    'resume',
    'suspend',
    'fail:interactive',
    'resume',
  ])
})

Tests.test('headless commands reject interactive execution before launch and batch commands never acquire the terminal', async () => {
  const events: string[] = []
  const runners = createCommandRunners({
    isInteractive: () => false,
    async prompt(action) {
      events.push('prompt')
      return await action()
    },
    async execute(_command, _options, mode) {
      events.push(mode)
    },
  })
  await Tests.expect(runners.runInteractiveCommand('auth')).rejects.toThrow('require a terminal')
  Tests.expect(events).toEqual([])
  await runners.runNonInteractiveCommand('build')
  Tests.expect(events).toEqual(['noninteractive'])
})
