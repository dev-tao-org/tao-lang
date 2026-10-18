import { Tests } from '@shared/os'
import { resolveOutputConfiguration } from '../output/Configuration'
import { createOutput, type OutputEvent } from '../output/Output'
import { createPlainOutput } from '../output/Plain'

Tests.test('selects interactive dev presentation and preserves explicit routing and noninteractive fallback', () => {
  const tty = { tty: true }
  Tests.expect(resolveOutputConfiguration('dev', tty)).toMatchObject({ ui: true, routing: { stdout: 'terminal' } })
  Tests.expect(resolveOutputConfiguration('agent', tty)).toMatchObject({ ui: false, routing: { stdout: 'log' } })
  Tests.expect(resolveOutputConfiguration('tao', tty)).toMatchObject({ ui: false, routing: { stdout: 'terminal' } })
  Tests.expect(resolveOutputConfiguration('agent', { ...tty, ui: '1', terminalOutput: '1' }))
    .toMatchObject({ ui: true, routing: { stdout: 'terminal', stderr: 'terminal' } })
  Tests.expect(resolveOutputConfiguration('dev', { ...tty, ui: '0', terminalOutput: '0' }))
    .toMatchObject({ ui: false, routing: { stdout: 'log', stderr: 'both' } })
  Tests.expect(resolveOutputConfiguration('dev', { tty: false, ui: '1' }).ui).toBe(false)
})

Tests.test('plain worker output preserves streams, interleaved partial lines, and trailing fragments', () => {
  const writes: { stream: OutputEvent['stream']; text: string }[] = []
  const plain = createPlainOutput((stream, text) => writes.push({ stream, text }))
  const output = createOutput(plain.write)
  const first = output.channel('first')
  const second = output.channel('second')
  first.stdout('hel')
  second.stderr('problem\n')
  first.stdout('lo\nnext')
  output.main.print('summary')
  second.progress('done')
  plain.finish()
  plain.finish()
  Tests.expect(writes).toEqual([
    { stream: 'stderr', text: '[second] problem\n' },
    { stream: 'stdout', text: '[first] hello\n' },
    { stream: 'stdout', text: 'summary\n' },
    { stream: 'progress', text: '[second] \u001b[90mdone\u001b[0m\n' },
    { stream: 'stdout', text: '[first] next\n' },
  ])
})
