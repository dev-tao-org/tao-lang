import type * as CST from '@cst'
import * as Grammar from '@grammar'
import { Range, S, Timings } from '@shared'
import * as Tests from '@shared-tests'

import { format } from '../fix-src/Fix/Format'
import { formattedSyntaxFixture, syntaxFixture, syntaxKinds } from './format.test-fixtures.Syntax'

const concreteSyntaxKinds = Object.keys(syntaxKinds)
  .filter(kind => !kind.startsWith('_'))
  .sort()

Tests.test('all current named grammar nodes format canonically and remain stable across reflow', () => {
  const tree = Grammar.createParser().parse(syntaxFixture)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect([...namedKinds(tree.rootNode)].sort()).toEqual(concreteSyntaxKinds)
  assertFormatted(syntaxFixture, formattedSyntaxFixture)
  const source = S`
    use @long/package First,Second,Third
    view Main(A text,B text){render Panel(A,B)}
  `
  Tests.expect(formatSource(source, 28)).toBe(S`
    use @long/package First,
      Second,
      Third

    view Main(A text, B text) {
      render Panel(A, B)
    }
  `)
  Tests.expect(formatSource(formatSource(source, 28), 120)).toBe(formatSource(source, 28))
})

Tests.test('formatting normalizes a complete source fixture without changing literals or native code', () => {
  assertFormatted(sourceFixture, expectedFixture)
})

Tests.test('formatting keeps nested private views after the owner render', () => {
  assertFormatted(
    'view Main{render Col{Card}view Card{render Text("card")}}',
    S`
      view Main {
        render Col {
          Card
        }
        view Card {
          render Text("card")
        }
      }
    `,
  )
})

Tests.test('argument and parameter lists wrap at the width and retain authored line breaks', () => {
  const source = 'view Main(First text, Second text) { render Panel("Hello", "World") }'
  const result = formatSource(source, 32)
  Tests.expect(result).toBe(S`
    view Main(
      First text,
      Second text
    ) {
      render Panel("Hello", "World")
    }
  `)
  Tests.expect(formatSource(result, 120)).toBe(result)
  const multiline = S`
    view Main {
      render Text(
        "Hi"
      )
    }
  `
  assertFormatted(
    S`
      view Main { render Text(
      "Hi"
      ) }
    `,
    multiline,
  )
})

Tests.test('formatting protects unfinished declarations while formatting complete neighbors', () => {
  const source = S`
    view Ready{render Text( "Hi" )}

    view Editing(
  `
  const parser = Grammar.createParser()
  const result = format({ source, tree: parser.parse(source) })
  Tests.expect(result.text).toBe('view Ready {\n  render Text("Hi")\n}\n\nview Editing(')
  Tests.expect(result.skipped.length).toBeGreaterThan(0)
  Tests.expect(formatSource(result.text)).toBe(result.text)
  const invalid = 'package view Root {'
  Tests.expect(format({ source: invalid, tree: parser.parse(invalid) }))
    .toEqual({ status: 'invalid', text: invalid, edits: [], skipped: [Range(0, invalid.length)] })
})

function formatSource(source: string, width?: number): string {
  return format({ source, tree: Grammar.createParser().parse(source) }, { width }).text
}

function namedKinds(node: CST.SyntaxNode, kinds = new Set<string>()): Set<string> {
  kinds.add(node.type)
  for (const child of node.namedChildren) {
    namedKinds(child, kinds)
  }
  return kinds
}

const assertFormatted = Timings.createTopLevelTimer(function(timings, source: string, expected: string): void {
  const parser = Grammar.createParser()
  const tree = parser.parse(source)
  const result = timings.run(format, { source, tree })
  Tests.expect(result.status).toBe('formatted')
  Tests.expect(result.text).toBe(expected)
  Tests.expect(tree.rootNode.text).toBe(source)
  Tests.expect(parser.parse(result.text).rootNode.hasError).toBe(false)
  Tests.expect(format({ source: result.text, tree: parser.parse(result.text) }).edits).toEqual([])
  Tests.expect(timings.samples.map(sample => sample.name))
    .toEqual(['formatter.rules', 'formatter.layout', 'formatter.format'])
})

const sourceFixture = S`
  // Greetings
  package view Main( Title text,Subtitle text ) { render #root Col { #hello Text( Title )


  Text( "a 😀 b" ) Text(Subtitle) } }
  folder view Native {
    render inject Value \`\`\`ts
      return " 😀  unchanged "
    \`\`\`
  } folder let Caption="c"
`

const expectedFixture = S`
  // Greetings
  package
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
