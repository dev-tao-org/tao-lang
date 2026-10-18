import { createParser } from '@grammar/parser'
import { S, Timings } from '@shared'
import { Tests } from '@shared/os'
import { format, type FormatInput, type FormatResult } from '../fix-src/Format'

Tests.test('visibility and nested render tags occupy their own preceding lines', () => {
  const { source, expected } = prefixFixture()
  const parser = createParser()
  const input: FormatInput = { source, tree: parser.parse(source).tree }
  const timings = new Timings('format-test')
  const result: FormatResult = format(input, timings)

  Tests.expect(result.status).toBe('formatted')
  Tests.expect(result.text).toBe(expected)
  Tests.expect(result.edits).toHaveLength(3)
  Tests.expect(input.tree.rootNode.text).toBe(source)
  Tests.expect(format({ source: result.text, tree: parser.parse(result.text).tree }))
    .toMatchObject({ status: 'formatted', edits: [] })
  Tests.expect(timings.samples.map(sample => sample.name)).toEqual(['formatter.format'])
})

Tests.test('compact prefixes move off the preceding statement or opening brace', () => {
  const source = 'public view Root { render Col { #message Text("x") } } folder let Caption = "c"'
  const parser = createParser()
  const result = format({ source, tree: parser.parse(source).tree })
  Tests.expect(result.text).toBe(S`
    public
    view Root { render Col {
        #message
        Text("x") } }
    folder
    let Caption = "c"
  `)
  Tests.expect(format({ source: result.text, tree: parser.parse(result.text).tree }))
    .toMatchObject({ status: 'formatted', edits: [] })
})

Tests.test('an unfinished Tao source is returned unchanged', () => {
  const source = 'public view Root {'
  Tests.expect(format({ source, tree: createParser().parse(source).tree }))
    .toEqual({ status: 'invalid', text: source, edits: [] })
})

function prefixFixture(): { source: string; expected: string } {
  return {
    source: S`
      public view Root {
        render #root Col {
          #message Text("a 😀 b")
        }
      }
      folder view Native {
        render inject \`\`\`ts
          return "  native code  "
        \`\`\`
      }
    `,
    expected: S`
      public
      view Root {
        render #root Col {
          #message
          Text("a 😀 b")
        }
      }
      folder
      view Native {
        render inject \`\`\`ts
          return "  native code  "
        \`\`\`
      }
    `,
  }
}
