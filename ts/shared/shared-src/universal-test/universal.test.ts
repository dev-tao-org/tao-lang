import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { Switch } from "../universal/universal";

Describe('Switch.on', () => {
  Test('dispatches exhaustively on a property, passing the handler the narrowed item', () => {
    type Message =
      | { type: 'text'; value: string }
      | { type: 'count'; value: number }

    const text: Message = { type: 'text', value: 'hello' }
    const count: Message = { type: 'count', value: 3 }

    const describe = (message: Message): string =>
      Switch.on(message, 'type', {
        // The `text` branch narrows to `{ type: 'text'; value: string }`, so `.toUpperCase()` type-checks
        // only because Switch.on passed the whole narrowed item rather than just `message.type`.
        text: item => item.value.toUpperCase(),
        count: item => item.value.toFixed(1),
      })

    Expect(describe(text)).toBe('HELLO')
    Expect(describe(count)).toBe('3.0')
  })
})
