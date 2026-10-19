import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { S } from '@shared'
import { Tests } from '@shared/os'
import { fix } from '../fix-src/Fix'
import { format } from '../fix-src/Format'

Tests.test('import organization collects, sorts, merges and deduplicates without removing unused names', () => {
  const source = S`
    use Text from tao@ui
    view Main { render Text("Hello") }
    use Col, Text from tao@ui
    use Text as Caption from tao@ui
    use package tao@ui as UI
    use Widget from widgets@ui
    use all from ./Other
  `
  const result = fixed(source)
  Tests.expect(result).toBe(S`
    use Col, Text, Text as Caption from tao@ui
    use package tao@ui as UI
    use Widget from widgets@ui
    use all from ./Other

    view Main {
      render Text("Hello")
    }
  `)
  Tests.expect(fixed(result)).toBe(result)
})

Tests.test('organizing imports keeps comments and their groups attached, including trailing comments', () => {
  const source = S`
    use Row from tao@ui
    // Native views
    use Text from tao@ui // Used by Main
    use Col from tao@ui
    view Main { render Text("Hello") }
  `
  const result = fixed(source)
  Tests.expect(result).toContain('// Native views\nuse Text from tao@ui // Used by Main\n')
  Tests.expect(result).toContain('use Col from tao@ui')
  Tests.expect(fixed(result)).toBe(result)
})

Tests.test('organizing imports removes duplicates across comment groups and keeps the comments', () => {
  const result = fixed(S`
    use Text from tao@ui
    // Text is used by the primary view.
    use Text from tao@ui
    view Main { render Text("Hello") }
  `)
  const importedText = 'use Text from tao@ui'
  Tests.expect(result.indexOf(importedText)).toBe(result.lastIndexOf(importedText))
  Tests.expect(result).toContain('// Text is used by the primary view.')
})

Tests.test('organizing duplicate multiline imports retains their interior comments once', () => {
  const result = fixed(S`
    use Text from tao@ui
    use Text,
      // Keep this line comment.
      /* Keep this block comment. */
      Text from tao@ui
    view Main { render Text("Hello") }
  `)
  Tests.expect(result.match(/use Text from tao@ui/g)).toHaveLength(1)
  Tests.expect(result.match(/\/\/ Keep this line comment\./g)).toHaveLength(1)
  Tests.expect(result.match(/\/\* Keep this block comment\. \*\//g)).toHaveLength(1)
  Tests.expect(fixed(result)).toBe(result)
})

function fixed(source: string): string {
  const parser = createParser()
  const tree = parser.parse(source).tree
  const ast = transform(tree)!
  Tests.expect(ast).toBeDefined()
  const result = fix({ source, tree, ast })
  Tests.expect(tree.rootNode.text).toBe(source)
  return format({ source: result.text, tree: parser.parse(result.text).tree }).text
}
