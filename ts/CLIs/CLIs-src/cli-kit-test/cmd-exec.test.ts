import { S } from '@shared'
import { Http, Repo, Tests } from '@shared/os'
import { runCommand, runSteps } from '../cli-kit/cli-kit'
import { createOutput } from '../cli-kit/output/Output'

Tests.test('awaits variadic void steps in order and stops at the original thrown failure', async () => {
  const events: string[] = []
  const failure = new Error('step failed')
  await Tests.expect(
    runSteps(
      async () => {
        events.push('first')
        await Promise.resolve()
        events.push('finished')
      },
      () => {
        events.push('second')
        throw failure
      },
      () => {
        events.push('third')
      },
    ),
  ).rejects.toBe(failure)
  Tests.expect(events).toEqual(['first', 'finished', 'second'])
  Tests.expect(await runSteps(() => {}, async () => {})).toBeUndefined()
})

Tests.test('command cancellation drains cooperative cleanup and cannot report a successful child as passed', async () => {
  const controller = Http.createAbortController()
  const captured: string[] = []
  const output = createOutput(event => {
    if (event.stream === 'stdout' || event.stream === 'stderr') {
      captured.push(event.text)
    }
    if (event.stream === 'stdout' && event.text.includes('ready')) {
      controller.abort()
    }
  })
  const child = S`
    import { Lifecycle, Terminal } from './shared/shared-src/os'
    const stopped = Lifecycle.waitForTermination()
    Terminal.stdout.write('ready\\n')
    await stopped
    Terminal.stderr.write('cleanup complete\\n')
  `
  await Tests.expect(runCommand('bun', {
    variadicArgs: ['-e', child],
    cwd: Repo.resolvePath('ts'),
    output: output.channel('fixture'),
    signal: controller.signal,
  })).rejects.toThrow('interrupted')
  Tests.expect(captured.join('')).toBe('ready\ncleanup complete\n')
  Tests.expect(output.snapshot().channels[0]?.status).toBe('failed')
  await output.finish()
})
