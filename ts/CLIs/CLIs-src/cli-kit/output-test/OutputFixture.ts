import '../fatal-errors'
import { Errors } from '@shared'
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
  if (mode === 'delegate') {
    await configureCLIOutput('agent', { delegate: true })
    await runCommand('bun run', { variadicArgs: [outputFixturePath, 'dev-child'] })
    await IO.finish()
    return
  }
  await configureCLIOutput(mode === 'dev-child' ? 'dev' : 'agent')
  IO.print('fixture routine details')
  IO.channel({ title: 'tool' }).stderr('ordinary tool stderr\n')
  IO.warn('\u001b[33mfixture warning\u001b[0m\n  at /tmp/fixture.ts:12')
  if (mode === 'parent' || mode === 'failed') {
    await runCommand('bun run', { variadicArgs: [outputFixturePath, 'child'], structuredOutput: true })
  }
  if (mode === 'failed') {
    Errors.ThrowUnexpected('fixture failure')
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
  await IO.prompt(async () => {
    events.push('prompt')
  })
  if (events.join(',') !== 'create,dispose,prompt,create') {
    Errors.ThrowUnexpected(`Unexpected prompt renderer lifecycle: ${events.join(',')}`)
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
