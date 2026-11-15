import * as Grammar from '@grammar'
import { CarriageReturnCharacter, NewlineCharacter, S } from '@shared'
import * as Tests from '@shared-tests'
import { FormatterResources } from '@shared/os'
import { format } from '../fix-src/Fix/Format'
import { createTypeScriptFormatter } from '../fix-src/lib/formatter/Embedded'

const MultilineLiteral = S`
  const value = \`first
    second\`;
  return value
`

Tests.test('native TSX formatting preserves literal values, aligns fences and leaves incomplete bodies alone', async () => {
  const typescript = createTypeScriptFormatter(await FormatterResources.typeScriptFormatterBytes())
  const source = S`
    view Native(Value text){render inject Value \`\`\`ts const count=1;return <Tao.Text value={ count }>{Value}</Tao.Text> \`\`\`}
  `
  const parser = Grammar.createParser()
  const formatted = format({ source, tree: parser.parse(source) }, { typescript })
  Tests.expect(formatted.status).toBe('formatted')
  Tests.expect(formatted.text).toBe(S`
    view Native(Value text) {
      render inject Value \`\`\`ts
        const count = 1
        return <Tao.Text value={count}>{Value}</Tao.Text>
      \`\`\`
    }
  `)
  Tests.expect(format({ source: formatted.text, tree: parser.parse(formatted.text) }, { typescript }).edits)
    .toEqual([])
  const literal = MultilineLiteral
  const token = '```ts' + literal + '```'
  const literalSource = 'view Literal { render inject ' + token + ' }'
  const result = format({ source: literalSource, tree: parser.parse(literalSource) }, { typescript })
  Tests.expect(result.text).toContain('`first\n  second`')
  const brokenToken = '```ts return <Tao.Text> ```'
  const broken = 'view Editing{render inject ' + brokenToken + '}'
  const partial = format({ source: broken, tree: parser.parse(broken) }, { typescript })
  Tests.expect(partial.status).toBe('partial')
  Tests.expect(partial.text).toContain(brokenToken)
  Tests.expect(partial.skipped).toHaveLength(1)
  const crlf = source.replaceAll(NewlineCharacter, CarriageReturnCharacter + NewlineCharacter)
    + (CarriageReturnCharacter + NewlineCharacter)
  const windows = format({ source: crlf, tree: parser.parse(crlf) }, { typescript }).text
  Tests.expect(windows.replaceAll(CarriageReturnCharacter + NewlineCharacter, '')).not.toContain('\n')
})
