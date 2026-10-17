import { S } from '@shared'
import { Tests } from '@shared/os'

Tests.describe('S', () => {
  Tests.test('removes boundary lines and common indentation while preserving relative indentation', () => {
    Tests.expect(S`
      Foo
      Bar
           Cat
      Tak
    `).toBe('Foo\nBar\n     Cat\nTak')
  })

  Tests.test('handles blank input, internal blank lines, tabs and Windows newlines', () => {
    Tests.expect(S`\n \t\n`).toBe('')
    Tests.expect(S`\r\n\tfirst\r\n\t\r\n\t\tsecond\r\n`).toBe('first\n\n\tsecond')
    Tests.expect(S`\n  value  \n`).toBe('value  ')
  })

  Tests.test('preserves cooked escapes and ordinary template substitutions', () => {
    Tests.expect(S`\n  value\\n\n`).toBe('value\\n')
    Tests.expect(S`count: ${2}, optional: ${null}`).toBe('count: 2, optional: null')
    Tests.expect(S`escaped \` and \${literal}`).toBe('escaped ` and ${literal}')
  })

  Tests.test('preserves indentation inside multiline values on their own line and inline', () => {
    const code = '    nested\n      deeper'
    Tests.expect(S`
      before
      ${code}
      after
    `).toBe('before\n    nested\n      deeper\nafter')
    Tests.expect(S`
      head ${'first\n  second'}
      tail
    `).toBe('head first\n  second\ntail')
  })
})
