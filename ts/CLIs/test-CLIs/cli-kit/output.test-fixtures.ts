import { Process } from '@shared/os'
import '../../CLIs-src/cli-kit/fatal-errors'
import { Errors, EscapeCharacter, NewlineCharacter, Try } from '@shared'
import * as Shared from '@shared'
import { Platform, Repo, Terminal } from '@shared/os'
import { runNonInteractiveCommand } from '../../CLIs-src/cli-kit/cmd-exec'
import { IO, renderOutput } from '../../CLIs-src/cli-kit/io'
import { configureCLIOutput } from '../../CLIs-src/cli-kit/output/Configuration'
import type { OutputRenderer } from '../../CLIs-src/cli-kit/output/Output'
import { runPaneFixture, writePaneChild } from './output.test-fixtures.Panes'

/** outputFixturePath locates the isolated CLI output fixture. */
export const outputFixturePath = Repo.resolvePath('ts/CLIs/test-CLIs/cli-kit/output.test-fixtures.ts')

if (Platform.isMain(import.meta)) {
  await runFixture()
}

async function runFixture(): Promise<void> {
  const mode = Process.argv[2]
  if (await runPaneMode(mode)) {
    return
  }
  if (mode === 'command-failure') {
    await configureCLIOutput('agent')
    const status = Process.argv[3] === 'null' ? null : Number(Process.argv[3])
    Errors.ThrowCommandExecution({ command: 'fixture', args: [], status, signal: null, stdout: '', stderr: '' })
  }
  if (mode === 'command-eof' || mode === 'command-eof-delegate') {
    await configureCLIOutput('dev', { delegate: mode === 'command-eof-delegate' })
    await runNonInteractiveCommand('cat')
    Terminal.stdout.write('command completed\n')
    await IO.finish()
    return
  }
  if (mode === 'prompt-lifecycle') {
    await runPromptLifecycleFixture()
    return
  }
  if (mode === 'prompt-dispose-recovery' || mode === 'prompt-render-recovery') {
    await runPromptRecoveryFixture(mode)
    return
  }
  if (mode === 'delegate') {
    await configureCLIOutput('agent', { delegate: true })
    await runNonInteractiveCommand('bun', ['run', outputFixturePath, 'dev-child'])
    await IO.finish()
    return
  }
  await configureCLIOutput(mode === 'dev-child' ? 'dev' : 'agent')
  IO.print('fixture routine details')
  IO.channel({ title: 'tool' }).stderr('ordinary tool stderr' + NewlineCharacter)
  IO.warn(
    Shared.joinTextLines(EscapeCharacter + '[33mfixture warning' + EscapeCharacter + '[0m', '  at /tmp/fixture.ts:12'),
  )
  if (mode === 'parent' || mode === 'failed') {
    await runNonInteractiveCommand('bun', ['run', outputFixturePath, 'child'], { structuredOutput: true })
  }
  if (mode === 'failed') {
    Errors.ThrowShouldNeverHappen('fixture failure')
  }
  IO.summary('fixture result')
  await IO.finish()
}

async function runPromptLifecycleFixture(): Promise<void> {
  const events: string[] = []
  const renderer = () => createRecordingRenderer(events)
  IO.config({ stdout: 'log', stderr: 'log', progress: 'log' })
  IO.setPromptRenderer(async () => {
    events.push('create')
    return renderer()
  })
  events.push('create')
  renderOutput(renderer())
  const accepted = await IO.askConfirm({ message: 'Fixture confirmation?', defaultValue: false }, {
    isInteractive: () => true,
    open: () => ({
      async question() {
        events.push('prompt')
        return 'yes'
      },
      close() {},
    }),
    write() {},
  })
  if (!accepted || events.join(',') !== 'create,dispose,prompt,create') {
    Errors.ThrowShouldNeverHappen(`Unexpected prompt renderer lifecycle: ${events.join(',')}`)
  }
  Terminal.stdout.write(events.join(',') + NewlineCharacter)
  await IO.finish()
}

function createRecordingRenderer(events: string[]): OutputRenderer {
  return {
    update() {},
    async dispose() {
      events.push('dispose')
    },
  }
}

type PromptRecoveryMode = 'prompt-dispose-recovery' | 'prompt-render-recovery'

async function runPromptRecoveryFixture(mode: PromptRecoveryMode): Promise<void> {
  const events: string[] = []
  let disposeAttempts = 0
  let rendererCreations = 0
  const renderer = (): OutputRenderer => ({
    update() {},
    async dispose() {
      disposeAttempts++
      events.push(`dispose ${disposeAttempts}`)
      if (mode === 'prompt-dispose-recovery' && disposeAttempts === 1) {
        Errors.ThrowShouldNeverHappen('renderer dispose failed')
      }
    },
  })
  IO.config({ stdout: 'log', stderr: 'log', progress: 'log' })
  IO.setPromptRenderer(async () => {
    rendererCreations++
    events.push(`create ${rendererCreations}`)
    if (mode === 'prompt-render-recovery' && rendererCreations === 1) {
      Errors.ThrowShouldNeverHappen('renderer creation failed')
    }
    return renderer()
  })
  renderOutput(renderer())
  let firstFailed = false
  await Try(() =>
    IO.prompt(async () => {
      events.push('prompt 1')
    }), {
    catch() {
      firstFailed = true
    },
  })
  if (!firstFailed) {
    Errors.ThrowShouldNeverHappen('The first renderer operation unexpectedly succeeded.')
  }
  await IO.prompt(async () => {
    events.push('prompt 2')
  })
  Terminal.stdout.write(events.join(',') + NewlineCharacter)
  await IO.finish()
}

async function runPaneRoutingFixture(): Promise<void> {
  let latest = ''
  const renderer = (): OutputRenderer => ({
    update(snapshot) {
      latest = snapshot.main.lines.join('|') + ' / '
        + snapshot.channels.map(channel => channel.lines.join('|')).join('/')
    },
    async dispose() {},
  })
  IO.config({ stdout: 'terminal', stderr: 'terminal', progress: 'terminal' })
  IO.setPromptRenderer(async () => renderer())
  renderOutput(renderer())
  const worker = IO.channel({ title: 'TypeScript shard 2' })
  await IO.prompt(async () => {
    IO.print('Managed npm declarations changed')
    worker.stdout('worker partial ')
    worker.stdout('completed\n')
    worker.stderr('worker stderr\n')
    IO.progress('Set up dependencies and continue?')
  })
  Terminal.stdout.write('RESTORED PANES: ' + latest + NewlineCharacter)
  await IO.finish()
}

async function runPaneMode(mode = ''): Promise<boolean> {
  if (mode === 'pane-interactive') {
    await runPaneFixture()
    return true
  }
  if (mode === 'pane-child') {
    writePaneChild()
    return true
  }
  if (mode === 'pane-routing') {
    await runPaneRoutingFixture()
    return true
  }
  return false
}
