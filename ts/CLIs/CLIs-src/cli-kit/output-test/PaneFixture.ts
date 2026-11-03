import React from '@runtime/client/Bridge_react/Bridge_react'
import { Errors, joinTextLines, NewlineCharacter, Try } from '@shared'
import { Http, Repo, Terminal } from '@shared/os'
import { Ink } from '../bridges/Bridge_ink'
import { runNonInteractiveCommand } from '../cmd-exec'
import { IO, renderOutput } from '../io'
import type { OutputSnapshot } from '../output/Output'
import { createPaneInput, type PaneInput } from '../output/tui/PromptInput'
import { OutputView } from '../output/tui/View'

/** runPaneFixture exercises public dashboard prompts while a captured child writes both streams. */
export async function runPaneFixture(): Promise<void> {
  let latest: OutputSnapshot
  const frames: string[] = []
  const input = createPaneInput(redraw)
  let questions = 0
  const cancellation = Http.createAbortController()
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
        input.receive('private', {} as Ink.Key)
        input.paste(NewlineCharacter + 'value')
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
  IO.summary('pane input completed')
  await IO.finish('failed')
  Terminal.stdout.write('PANES' + NewlineCharacter + frames.join(NewlineCharacter))

  function redraw(): void {
    const snapshot = { ...latest, prompt: input.message() }
    frames.push(Ink.renderToString(React.createElement(OutputView, { snapshot, now: 0, width: 100, height: 24 })))
  }
}

async function exercisePanePrompts(input: PaneInput): Promise<void> {
  const channel = IO.channel({ title: 'TypeScript shard 2' })
  IO.print('Managed npm declarations changed')
  const confirmation = IO.askConfirm({ message: 'Set up dependencies and continue?', defaultValue: true })
  await runNonInteractiveCommand('bun run', {
    variadicArgs: [Repo.resolvePath('ts/CLIs/CLIs-src/cli-kit/output-test/OutputFixture.ts'), 'pane-child'],
    output: channel,
  })
  input.paste('invalid')
  input.receive('', { return: true } as Ink.Key)
  if (!await confirmation) {
    Errors.ThrowUserInput('Fixture setup declined.')
  }
  const secret = await IO.askSecret('Fixture hidden token: ')
  if (secret !== joinTextLines('private', 'value')) {
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
