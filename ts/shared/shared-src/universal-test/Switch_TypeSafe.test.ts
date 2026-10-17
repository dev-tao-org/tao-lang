import { Test } from '@shared/os'
import { Switch } from '../universal/universal'

Test.describe('Switch.on', () => {
  Test.test('dispatches exhaustively on a property, passing the handler the narrowed item', () => {
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

    Test.expect(describe(text)).toBe('HELLO')
    Test.expect(describe(count)).toBe('3.0')
  })
})
