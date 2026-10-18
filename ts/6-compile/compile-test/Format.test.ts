import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { S, Timings } from '@shared'
import { Tests } from '@shared/os'
import { compile } from '../compile-src/Compile'
import { createFormatter, type Formatter } from '../compile-src/Format'

Tests.test('generated app code can be formatted separately from synchronous compilation', async () => {
  const source = S`
    app Main { root Root }
    view Root { render inject \`\`\`ts return <TR.ReactNative.Text>Hello</TR.ReactNative.Text> \`\`\` }
  `
  const document = transform(createParser().parse(source).tree)!
  const text = compile(document, { revision: 'format-test' })
  const timings = new Timings('format-test')
  const formatter: Formatter = await createFormatter(timings)
  const file = { path: 'App.tsx', text }
  const formatted = formatter.format(file, timings)

  Tests.expect(formatted).toContain(S`
    export default function App() {
      return TR.App(TR.ViewReference(_scope0, 'Root'), 'format-test')
    }
  `)
  Tests.expect(formatted).toContain('return <TR.ReactNative.Text>Hello</TR.ReactNative.Text>')
  Tests.expect(file.text).toBe(text)
  Tests.expect(formatter.format({ ...file, text: formatted })).toBe(formatted)
  Tests.expect(timings.samples.map(sample => sample.name)).toEqual(['formatter.initialize', 'formatter.format'])
})
