import React from '@runtime/client/Bridge_react/Bridge_react'
import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { Text } from '@shared/os'
import { Ink } from '../../CLIs-src/cli-kit/bridges/Bridge_ink'
import { createOutput, formatCommands, type OutputSnapshot } from '../../CLIs-src/cli-kit/output/Output'
import { OutputView } from '../../CLIs-src/cli-kit/output/tui/View'

Tests.test('commands remain last after new output and channels, with emphasized lowercase keys', async () => {
  const output = createOutput(() => {})
  output.setCommands([{ key: 'w', label: 'open web' }, { key: 'q', label: 'quit' }])
  output.main.print('Opening Chrome…')
  let rendered = renderView(output.snapshot())
  Tests.expect(Text.stripAnsi(rendered).trimEnd()).toEndWith(
    'No active channels.' + NewlineCharacter + 'Commands: open web | quit',
  )
  const channel = output.channel('Compile')
  channel.print('Changed source')
  rendered = renderView(output.snapshot())
  Tests.expect(Text.stripAnsi(rendered).trimEnd()).toEndWith('Commands: open web | quit')
  Tests.expect(rendered).toContain('Changed source')
  Tests.expect(rendered).toContain('\u001b[1m\u001b[4m\u001b[36mw')
  Tests.expect(rendered).toContain('\u001b[1m\u001b[4m\u001b[36mq')
  const styled = formatCommands(output.snapshot().commands, true)
  Tests.expect(styled).toContain('\u001b[1;4;36mw\u001b[0m')
  Tests.expect(styled).toContain('\u001b[1;4;36mq\u001b[0m')
  output.setCommands([])
  rendered = renderView(output.snapshot())
  Tests.expect(rendered).not.toContain('Commands:')
  await output.finish()
})

function renderView(snapshot: OutputSnapshot): string {
  return Ink.renderToString(React.createElement(OutputView, { snapshot, now: 0, width: 80, height: 24 }))
}
