import { Tests } from '@shared/os'
import { Switch } from '../universal/universal'

Tests.describe('Switch.on', () => {
  Tests.test('dispatches exhaustively on a property, passing the handler the narrowed item', () => {
    type Message =
      | { type: 'text'; value: string }
      | { type: 'count'; value: number }

    const text: Message = { type: 'text', value: 'hello' }
    const count: Message = { type: 'count', value: 3 }

    const describe = (message: Message): string =>
      Switch.on(message, 'type', {
        // The `text` branch narrows to `{ type: 'text'; value: string }`, so `.toUpperCase()` type-checks
        // only because Switch.on passed the whole narrowed item rather than just `message.type`.
        text(item) {
          return item.value.toUpperCase()
        },
        count(item) {
          return item.value.toFixed(1)
        },
      })

    Tests.expect(describe(text)).toBe('HELLO')
    Tests.expect(describe(count)).toBe('3.0')
  })
})

Tests.test('Switch.on requires and narrows the undefined discriminator branch', () => {
  type Message = { kind: 'ready'; value: string } | { kind: undefined }
  const render = (message: Message): string =>
    Switch.on(message, 'kind', {
      ready(item) {
        return item.value
      },
      undefined(item) {
        const kind: undefined = item.kind
        return String(kind)
      },
    })
  const incomplete = (message: Message) => {
    // @ts-expect-error The undefined variant needs its own handler.
    return Switch.on(message, 'kind', {
      ready(item) {
        return item.value
      },
    })
  }
  Tests.expect(render({ kind: 'ready', value: 'ok' })).toBe('ok')
  Tests.expect(render({ kind: undefined })).toBe('undefined')
  Tests.expect(() => incomplete({ kind: undefined })).toThrow()
})
