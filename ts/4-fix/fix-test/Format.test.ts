import type { SyntaxNode } from '@grammar/CST'
import { createParser } from '@grammar/parser'
import { S, Timings } from '@shared'
import { Tests } from '@shared/os'
import { format } from '../fix-src/Format'
import { formattedSyntaxFixture, syntaxFixture, syntaxKinds } from './SyntaxFixture'

Tests.test('all current grammar rules format canonically and remain stable across reflow', () => {
  const tree = createParser().parse(syntaxFixture).tree
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect([...namedKinds(tree.rootNode)].sort()).toEqual(Object.keys(syntaxKinds).sort())
  assertFormatted(syntaxFixture, formattedSyntaxFixture)
  const source = 'use First,Second,Third from @long/package\nview Main(A text,B text){render Panel(A,B)}'
  Tests.expect(formatted(source, 28)).toBe(S`
    use First,
      Second,
      Third
    from @long/package

    view Main(A text, B text) {
      render Panel(A, B)
    }
  `)
  Tests.expect(formatted(formatted(source, 28), 120)).toBe(formatted(source, 28))
})

Tests.test('formatting normalizes a complete source fixture without changing literals or native code', () => {
  assertFormatted(sourceFixture, expectedFixture)
})

Tests.test('argument and parameter lists wrap at the width and retain authored line breaks', () => {
  const source = 'view Main(First text, Second text) { render Panel("Hello", "World") }'
  const result = formatted(source, 32)
  Tests.expect(result).toBe(S`
    view Main(
      First text,
      Second text
    ) {
      render Panel("Hello", "World")
    }
  `)
  Tests.expect(formatted(result, 120)).toBe(result)
  const multiline = S`
    view Main {
      render Text(
        "Hi"
      )
    }
  `
  assertFormatted('view Main { render Text(\n"Hi"\n) }', multiline)
})

Tests.test('formatting protects unfinished declarations while formatting complete neighbors', () => {
  const source = 'view Ready{render Text( "Hi" )}\n\nview Editing('
  const parser = createParser()
  const result = format({ source, tree: parser.parse(source).tree })
  Tests.expect(result.text).toBe('view Ready {\n  render Text("Hi")\n}\n\nview Editing(')
  Tests.expect(result.skipped.length).toBeGreaterThan(0)
  Tests.expect(formatted(result.text)).toBe(result.text)
  const invalid = 'public view Root {'
  Tests.expect(format({ source: invalid, tree: parser.parse(invalid).tree }))
    .toEqual({ status: 'invalid', text: invalid, edits: [], skipped: [{ start: 0, end: invalid.length }] })
})

function formatted(source: string, width?: number): string {
  return format({ source, tree: createParser().parse(source).tree }, undefined, { width }).text
}

function namedKinds(node: SyntaxNode, kinds = new Set<string>()): Set<string> {
  kinds.add(node.type)
  for (const child of node.namedChildren) {
    namedKinds(child, kinds)
  }
  return kinds
}

function assertFormatted(source: string, expected: string): void {
  const parser = createParser()
  const tree = parser.parse(source).tree
  const timings = new Timings('format-test')
  const result = format({ source, tree }, timings)
  Tests.expect(result.status).toBe('formatted')
  Tests.expect(result.text).toBe(expected)
  Tests.expect(tree.rootNode.text).toBe(source)
  Tests.expect(parser.parse(result.text).tree.rootNode.hasError).toBe(false)
  Tests.expect(format({ source: result.text, tree: parser.parse(result.text).tree }).edits).toEqual([])
  Tests.expect(timings.samples.map(sample => sample.name))
    .toEqual(['formatter.rules', 'formatter.layout', 'formatter.format'])
}

const sourceFixture = S`
  // Greetings
  public view Main( Title text,Subtitle text ) { render #root Col { #hello Text( Title )


  Text( "a 😀 b" ) Text(Subtitle) } }
  folder view Native {
    render inject Value \`\`\`ts
      return " 😀  unchanged "
    \`\`\`
  } folder let Caption="c"
`

const expectedFixture = S`
  // Greetings
  public
  view Main(Title text, Subtitle text) {
    render #root Col {
      #hello
      Text(Title)

      Text("a 😀 b")
      Text(Subtitle)
    }
  }

  folder
  view Native {
    render inject Value \`\`\`ts
      return " 😀  unchanged "
    \`\`\`
  }

  folder
  let Caption = "c"
`
