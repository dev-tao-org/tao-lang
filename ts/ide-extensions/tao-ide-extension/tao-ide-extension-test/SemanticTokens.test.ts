import { Range, Source } from '@shared'
import { Tests } from '@shared/os'
import { semanticTokenRanges } from '../tao-ide-extension-src/SemanticTokens'

Tests.test('editor tokens retain expressions inside template strings without overlapping', () => {
  const source = '`Hello ${name.toUpperCase()}`'
  const name = source.indexOf('name')
  const method = source.indexOf('toUpperCase')
  const tokens = semanticTokenRanges([
    { range: Range(0, source.length), kind: 'string' },
    { range: Range(name, name + 4), kind: 'variable' },
    { range: Range(method, method + 11), kind: 'function' },
  ])
  Tests.expect(tokens.map(token => [Source.slice(source, token), token.kind])).toEqual([
    ['`Hello ${', 'string'],
    ['name', 'variable'],
    ['.', 'string'],
    ['toUpperCase', 'function'],
    ['()}`', 'string'],
  ])
  Tests.expect(tokens.every((token, index) => index === 0 || token.range.start >= tokens[index - 1]!.range.end)).toBe(
    true,
  )
})
