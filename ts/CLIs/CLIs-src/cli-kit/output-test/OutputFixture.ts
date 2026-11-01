import '../fatal-errors'
import { Errors, joinTextLines, Try } from '@shared'
import { Platform, Repo, Terminal } from '@shared/os'
import { runCommand } from '../cmd-exec'
import { IO, renderOutput } from '../io'
import { configureCLIOutput } from '../output/Configuration'
import type { OutputRenderer } from '../output/Output'

/** outputFixturePath locates the isolated CLI output fixture. */
export const outputFixturePath = Repo.resolvePath('ts/CLIs/CLIs-src/cli-kit/output-test/OutputFixture.ts')

if (Platform.isMain(import.meta)) {
  await runFixture()
}

async function runFixture(): Promise<void> {
  const mode = Platform.argv[2]
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
    await runCommand('bun run', { variadicArgs: [outputFixturePath, 'dev-child'] })
    await IO.finish()
    return
  }
  await configureCLIOutput(mode === 'dev-child' ? 'dev' : 'agent')
  IO.print('fixture routine details')
  IO.channel({ title: 'tool' }).stderr('ordinary tool stderr\n')
  IO.warn(joinTextLines('\u001b[33mfixture warning\u001b[0m', '  at /tmp/fixture.ts:12'))
  if (mode === 'parent' || mode === 'failed') {
    await runCommand('bun run', { variadicArgs: [outputFixturePath, 'child'], structuredOutput: true })
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
  Terminal.stdout.write(events.join(',') + '\n')
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
  Terminal.stdout.write(events.join(',') + '\n')
  await IO.finish()
}
