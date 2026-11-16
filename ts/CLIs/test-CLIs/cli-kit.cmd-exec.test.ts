import { S } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Platform, Repo } from '@shared/os'
import { Cancellation } from '@shared/web'
import { runNonInteractiveCommand, runSteps } from '../CLIs-src/cli-kit/cli-kit'
import { createOutput } from '../CLIs-src/cli-kit/output/Output'

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
  const controller = Cancellation.createController()
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
    import { Process, Terminal } from './shared/shared-src/os'
    const stopped = Process.waitForTermination()
    Terminal.stdout.write('ready\\n')
    await stopped
    Terminal.stderr.write('cleanup complete\\n')
  `
  await Tests.expect(runNonInteractiveCommand('bun', ['-e', child], {
    cwd: Repo.resolvePath('ts'),
    output: output.channel('fixture'),
    signal: controller.signal,
  })).rejects.toThrow('interrupted')
  Tests.expect(captured.join('')).toBe('ready\ncleanup complete\n')
  Tests.expect(output.snapshot().channels[0]?.status).toBe('failed')
  await output.finish()
})

Tests.test('batch commands read explicitly supplied files without acquiring terminal input', async () => {
  const path = Artifacts.resolvePath('tmp', 'command-input-' + Platform.randomUUID() + '.txt')
  Artifacts.trackTemporary(path)
  await FS.writeFile(path, 'explicit command input\n')
  const captured: string[] = []
  const output = createOutput(event => {
    if (event.stream === 'stdout') {
      captured.push(event.text)
    }
  })
  await runNonInteractiveCommand('cat', [], { stdin: FS.file(path), output: output.channel('fixture') })
  Tests.expect(captured.join('')).toBe('explicit command input\n')
  await output.finish()
})
