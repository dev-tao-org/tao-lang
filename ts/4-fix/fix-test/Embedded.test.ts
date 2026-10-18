import { createParser } from '@grammar/parser'
import { S } from '@shared'
import { FormatterResources, Tests } from '@shared/os'
import { format } from '../fix-src/Format'
import { createTypeScriptFormatter } from '../fix-src/lib/formatter/Embedded'

Tests.test('native TSX formatting preserves literal values, aligns fences and leaves incomplete bodies alone', async () => {
  const typescript = createTypeScriptFormatter(await FormatterResources.typeScriptFormatterBytes())
  const source = S`
    view Native(Value text){render inject Value \`\`\`ts const count=1;return <TR.ReactNative.Text value={ count }>{Value}</TR.ReactNative.Text> \`\`\`}
  `
  const parser = createParser()
  const formatted = format({ source, tree: parser.parse(source).tree }, undefined, { typescript })
  Tests.expect(formatted.status).toBe('formatted')
  Tests.expect(formatted.text).toBe(S`
    view Native(Value text) {
      render inject Value \`\`\`ts
        const count = 1
        return <TR.ReactNative.Text value={count}>{Value}</TR.ReactNative.Text>
      \`\`\`
    }
  `)
  Tests.expect(
    format({ source: formatted.text, tree: parser.parse(formatted.text).tree }, undefined, { typescript }).edits,
  )
    .toEqual([])
  const literal = 'const value = `first\n  second`;\nreturn value'
  const token = '```ts' + literal + '```'
  const literalSource = 'view Literal { render inject ' + token + ' }'
  const result = format({ source: literalSource, tree: parser.parse(literalSource).tree }, undefined, { typescript })
  Tests.expect(result.text).toContain('`first\n  second`')
  const brokenToken = '```ts return <TR.ReactNative.Text> ```'
  const broken = 'view Editing{render inject ' + brokenToken + '}'
  const partial = format({ source: broken, tree: parser.parse(broken).tree }, undefined, { typescript })
  Tests.expect(partial.status).toBe('partial')
  Tests.expect(partial.text).toContain(brokenToken)
  Tests.expect(partial.skipped).toHaveLength(1)
  const crlf = source.replaceAll('\n', '\r\n') + '\r\n'
  const windows = format({ source: crlf, tree: parser.parse(crlf).tree }, undefined, { typescript }).text
  Tests.expect(windows.replaceAll('\r\n', '')).not.toContain('\n')
})
