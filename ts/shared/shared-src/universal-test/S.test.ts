import { S } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'

Describe('S', () => {
  Test('removes boundary lines and common indentation while preserving relative indentation', () => {
    Expect(S`
      Foo
      Bar
           Cat
      Tak
    `).toBe('Foo\nBar\n     Cat\nTak')
  })

  Test('handles blank input, internal blank lines, tabs and Windows newlines', () => {
    Expect(S`\n \t\n`).toBe('')
    Expect(S`\r\n\tfirst\r\n\t\r\n\t\tsecond\r\n`).toBe('first\n\n\tsecond')
    Expect(S`\n  value  \n`).toBe('value  ')
  })

  Test('preserves cooked escapes and ordinary template substitutions', () => {
    Expect(S`\n  value\\n\n`).toBe('value\\n')
    Expect(S`count: ${2}, optional: ${null}`).toBe('count: 2, optional: null')
    Expect(S`escaped \` and \${literal}`).toBe('escaped ` and ${literal}')
  })

  Test('preserves indentation inside multiline values on their own line and inline', () => {
    const code = '    nested\n      deeper'
    Expect(S`
      before
      ${code}
      after
    `).toBe('before\n    nested\n      deeper\nafter')
    Expect(S`
      head ${'first\n  second'}
      tail
    `).toBe('head first\n  second\ntail')
  })
})
