import { EscapeCharacter, NewlineCharacter, RecordSeparatorCharacter } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Text } from '@shared/os'
import { createOutput, formatChannelCompletion } from '../../../CLIs-src/cli-kit/output/Output'
import {
  createProcessOutput,
  encodeOutputMessage,
  type OutputMessage,
} from '../../../CLIs-src/cli-kit/output/ProcessOutput'
import { displayStatus, elapsed, wrappedTail } from '../../../CLIs-src/cli-kit/output/tui/Display'

Tests.test('output preserves streamed UTF-8 and raw sink text while keeping visible lines plain', async () => {
  const events: Array<{ text: string; stream: string }> = []
  const output = createOutput(event => events.push({ text: event.text, stream: event.stream }))
  const worker = output.channel('worker')
  worker.stdout(new Uint8Array([0xe2, 0x82]))
  worker.stdout(new Uint8Array([0xac]))
  worker.stdout(NewlineCharacter)
  worker.warn('ready')

  Tests.expect(events.map(event => event.text)).toEqual(['€', '\n', '\u001b[33mready\u001b[0m\n'])
  Tests.expect(events.map(event => event.stream)).toEqual(['stdout', 'stdout', 'stdout'])
  Tests.expect(output.snapshot().channels[0]?.lines).toEqual(['€', 'ready', ''])
  Tests.expect(Text.stripAnsi(output.snapshot().channels[0]?.lines.join('') ?? '')).toBe('€ready')
  await output.finish()
})

Tests.test('output snapshots retain only the bounded tail of each channel', async () => {
  const output = createOutput(() => {})
  const worker = output.channel('worker')
  worker.stdout(Array.from({ length: 100 }, (_, index) => `line-${index}${NewlineCharacter}`).join('') + 'last')

  const lines = output.snapshot().channels[0]?.lines ?? []
  Tests.expect(lines).toHaveLength(80)
  Tests.expect(lines[0]).toBe('line-21')
  Tests.expect(lines.at(-1)).toBe('last')
  await output.finish()
})

Tests.test('subprocess output retains framed severity across byte fragments without classifying raw stderr', () => {
  const raw: string[] = []
  const messages: OutputMessage[] = []
  const pipe = createProcessOutput(text => raw.push(text), event => messages.push(event))
  const frame = encodeOutputMessage({ stream: 'stdout', level: 'warn', text: '\u20AC warning' + NewlineCharacter })
  const encode = Text.encodeUtf8
  const source = Shared.joinTextLines('normal stderr', frame + (RecordSeparatorCharacter + 'invalid'), 'trailing')
  const bytes = encode(source)
  for (const byte of bytes) {
    pipe.write(new Uint8Array([byte]))
  }
  pipe.finish()
  Tests.expect(raw.join('')).toBe('normal stderr\n\u001einvalid\ntrailing')
  Tests.expect(messages).toEqual([{ stream: 'stdout', level: 'warn', text: '€ warning\n' }])
})

Tests.test('wrapped tails preserve ANSI styling and complete Unicode while selecting from the bottom', () => {
  const source = EscapeCharacter
    + '[31mab\u754Ce\u0301\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66z' + EscapeCharacter + '[0m'
  const wrapped = wrappedTail([source], 4, 8)
  Tests.expect(wrapped.join('')).toContain('\u001b[31m')
  Tests.expect(Text.stripAnsi(wrapped.join('')).normalize('NFC')).toBe('ab界e\u0301👨‍👩‍👧‍👦z'.normalize('NFC'))
  Tests.expect(wrappedTail(['abcdef'], 3, 1)).toEqual(['def'])
  Tests.expect(wrappedTail(['one', 'two', 'three'], 20, 2)).toEqual(['two', 'three'])
})

Tests.test('channel status and elapsed display follow run transitions', () => {
  Tests.expect(formatChannelCompletion({
    title: 'worker',
    status: 'passed',
    lines: [],
    startedAtMs: 1000,
    finishedAtMs: 1230,
  })).toBe('passed in 0.23s')
  Tests.expect(displayStatus('idle')).toEqual({ mark: '○', color: 'gray' })
  Tests.expect(displayStatus('running')).toEqual({ mark: '●', color: 'yellow' })
  Tests.expect(displayStatus('passed')).toEqual({ mark: '✓', color: 'green' })
  Tests.expect(displayStatus('failed')).toEqual({ mark: '✗', color: 'red' })
  const channel = { title: 'worker', status: 'running' as const, lines: [], startedAtMs: 1_000 }
  Tests.expect(elapsed(channel, 5_500)).toBe('0:04')
  Tests.expect(elapsed({ ...channel, status: 'passed', finishedAtMs: 5_500 }, 9_000)).toBe('0:04')
})

Tests.test('finishing output disposes its installed renderer after the final update', async () => {
  const updates: string[] = []
  let disposed = false
  const output = createOutput(() => {})
  const worker = output.channel('worker')
  output.render({
    update(snapshot) {
      updates.push(`${snapshot.main.status}:${snapshot.channels[0]?.status ?? 'missing'}`)
    },
    async dispose() {
      disposed = true
    },
  })
  output.main.start()
  worker.start()
  worker.finish('passed')
  output.main.finish('failed')
  await output.finish()

  Tests.expect(updates).toEqual(['idle:idle', 'running:idle', 'running:running', 'running:passed', 'failed:passed'])
  Tests.expect(disposed).toBe(true)
})
