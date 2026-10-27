import { Tests } from '@shared/os'
import { semanticTokenRanges } from '../tao-ide-extension-src/SemanticTokens'

Tests.test('editor tokens retain expressions inside template strings without overlapping', () => {
  const source = '`Hello ${name.toUpperCase()}`'
  const name = source.indexOf('name')
  const method = source.indexOf('toUpperCase')
  const tokens = semanticTokenRanges([
    { range: { start: 0, end: source.length }, kind: 'string' },
    { range: { start: name, end: name + 4 }, kind: 'variable' },
    { range: { start: method, end: method + 11 }, kind: 'function' },
  ])
  Tests.expect(tokens.map(token => [source.slice(token.range.start, token.range.end), token.kind])).toEqual([
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
