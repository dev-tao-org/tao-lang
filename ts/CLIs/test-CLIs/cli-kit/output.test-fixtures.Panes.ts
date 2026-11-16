import React from '@runtime/client/Bridge_react/Bridge_react'
import { Errors, NewlineCharacter, Try } from '@shared'
import * as Shared from '@shared'
import { Repo, Terminal } from '@shared/os'
import { Cancellation } from '@shared/web'
import { Ink } from '../../CLIs-src/cli-kit/bridges/Bridge_ink'
import { runNonInteractiveCommand } from '../../CLIs-src/cli-kit/cmd-exec'
import { IO, renderOutput } from '../../CLIs-src/cli-kit/io'
import type { OutputSnapshot } from '../../CLIs-src/cli-kit/output/Output'
import { createPaneInput, type PaneInput } from '../../CLIs-src/cli-kit/output/tui/PromptInput'
import { OutputView } from '../../CLIs-src/cli-kit/output/tui/View'

/** PaneSecretLines identifies the typed and pasted lines checked for leaks in dashboard output. */
export const PaneSecretLines = ['fixture-secret-typed-9f2c', 'fixture-secret-pasted-7a4e'] as const

/** runPaneFixture exercises public dashboard prompts while a captured child writes both streams. */
export async function runPaneFixture(): Promise<void> {
  let latest!: OutputSnapshot
  const frames: string[] = []
  const input = createPaneInput(redraw)
  let questions = 0
  const cancellation = Cancellation.createController()
  IO.config({ stdout: 'terminal', stderr: 'terminal', progress: 'terminal' })
  renderOutput({
    update(snapshot) {
      latest = snapshot
      redraw()
    },
    async dispose() {},
    readInput(request) {
      const answer = input.read(request)
      if (request.signal) {
        cancellation.abort()
      } else if (request.secret) {
        input.receive(PaneSecretLines[0], {} as Ink.Key)
        input.paste(NewlineCharacter + PaneSecretLines[1])
      } else if (++questions > 1) {
        input.receive('yex', {} as Ink.Key)
        input.receive('', { backspace: true } as Ink.Key)
        input.receive('s', {} as Ink.Key)
        input.receive('', { return: true } as Ink.Key)
      }
      return answer
    },
  })
  await exercisePanePrompts(input)
  await requirePaneCancellation(cancellation.signal)
  recordCompletionFailure()
  prepareCrowdedPaneFixture()
  IO.summary('pane input completed')
  await IO.finish('failed')
  const finalFrame = renderFrame(latest, 80, 12)
  Terminal.stdout.write(Shared.joinTextLines('PANES', ...frames, 'FINAL', finalFrame))

  function redraw(): void {
    const snapshot = { ...latest, prompt: input.message() }
    frames.push(renderFrame(snapshot, 100, 24))
  }
}

function prepareCrowdedPaneFixture(): void {
  IO.setCommands([{ key: 'q', label: 'quit' }])
  for (let index = 0; index < 5; index++) {
    IO.channel({ title: `Fixture worker ${index}` }).finish('passed')
  }
}

function renderFrame(snapshot: OutputSnapshot, width: number, height: number): string {
  return Ink.renderToString(React.createElement(OutputView, { snapshot, now: 0, width, height }))
}

async function exercisePanePrompts(input: PaneInput): Promise<void> {
  const channel = IO.channel({ title: 'TypeScript shard 2' })
  IO.print('Managed npm declarations changed')
  const confirmation = IO.askConfirm({ message: 'Set up dependencies and continue?', defaultValue: true })
  const fixture = Repo.resolvePath('ts/CLIs/test-CLIs/cli-kit/output.test-fixtures.ts')
  await runNonInteractiveCommand('bun', ['run', fixture, 'pane-child'], { output: channel })
  input.paste('invalid')
  input.receive('', { return: true } as Ink.Key)
  if (!await confirmation) {
    Errors.ThrowUserInput('Fixture setup declined.')
  }
  const secret = await IO.askSecret('Fixture hidden token: ')
  if (secret !== Shared.joinTextLines(...PaneSecretLines)) {
    Errors.ThrowShouldNeverHappen('Fixture secret changed.')
  }
}

/** writePaneChild emits ordinary tool output without configuring another dashboard. */
export function writePaneChild(): void {
  Terminal.stdout.write('shard stdout ')
  Terminal.stdout.write('completed' + NewlineCharacter)
  Terminal.stderr.write('shard stderr completed' + NewlineCharacter)
}

async function requirePaneCancellation(signal: AbortSignal): Promise<void> {
  let cancelled = false
  await Try(() => IO.askConfirm({ message: 'Cancel setup?', signal }), {
    catch(error) {
      cancelled = Errors.isTaoError(error) && error.messageForUser === 'Confirmation cancelled.'
    },
  })
  if (!cancelled) {
    Errors.ThrowShouldNeverHappen('Fixture cancellation did not reach its active reader.')
  }
}

function recordCompletionFailure(): void {
  IO.warn('fixture completion warning')
  const channel = IO.channel({ title: 'Failed worker' })
  channel.start()
  channel.printToStdErr('fixture worker failure')
  channel.finish('failed')
}
