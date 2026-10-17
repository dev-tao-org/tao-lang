import { S } from '@shared'
import { Test } from '@shared/os'

Test.describe('S', () => {
  Test.test('removes boundary lines and common indentation while preserving relative indentation', () => {
    Test.expect(S`
      Foo
      Bar
           Cat
      Tak
    `).toBe('Foo\nBar\n     Cat\nTak')
  })

  Test.test('handles blank input, internal blank lines, tabs and Windows newlines', () => {
    Test.expect(S`\n \t\n`).toBe('')
    Test.expect(S`\r\n\tfirst\r\n\t\r\n\t\tsecond\r\n`).toBe('first\n\n\tsecond')
    Test.expect(S`\n  value  \n`).toBe('value  ')
  })

  Test.test('preserves cooked escapes and ordinary template substitutions', () => {
    Test.expect(S`\n  value\\n\n`).toBe('value\\n')
    Test.expect(S`count: ${2}, optional: ${null}`).toBe('count: 2, optional: null')
    Test.expect(S`escaped \` and \${literal}`).toBe('escaped ` and ${literal}')
  })

  Test.test('preserves indentation inside multiline values on their own line and inline', () => {
    const code = '    nested\n      deeper'
    Test.expect(S`
      before
      ${code}
      after
    `).toBe('before\n    nested\n      deeper\nafter')
    Test.expect(S`
      head ${'first\n  second'}
      tail
    `).toBe('head first\n  second\ntail')
  })
})
