import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'

import { S } from '@shared'

import { fix } from '../fix-src/Fix'
import { format } from '../fix-src/Fix/Format'

const TextImportLineRegx = /^use .*\bText\b.*$/gm
const ColImportLineRegx = /^use .*\bCol\b.*$/gm
const UnresolvedImportAliasRegx = /Missing as Unresolved/g
const CaptionImportAliasRegx = /Badge as Caption/g
const CanonicalTextImportRegx = /use tao@ui Text/g
const PreservedLineCommentRegx = /\/\/ Keep this line comment\./g
const PreservedBlockCommentRegx = /\/\* Keep this block comment\. \*\//g

Tests.test('import organization collects, sorts, merges and deduplicates without removing unused names', () => {
  const source = S`
    use tao@ui Text
    view Main { render Text("Hello") }
    use tao@ui Col, Text
    use tao@ui Text as Caption
    use widgets@ui Widget
    use ./Other Item
  `
  const result = fixSource(source)
  Tests.expect(result).toBe(S`
    use tao@ui Col, Text, Text as Caption
    use widgets@ui Widget
    use ./Other Item

    view Main {
      render Text("Hello")
    }
  `)
  Tests.expect(fixSource(result)).toBe(result)
})

Tests.test('organizing imports keeps comments and their groups attached, including trailing comments', () => {
  const source = S`
    use tao@ui Row
    // Native views
    use tao@ui Text // Used by Main
    use tao@ui Col
    view Main { render Text("Hello") }
  `
  const result = fixSource(source)
  Tests.expect(result).toContain('// Native views\nuse tao@ui Text // Used by Main\n')
  Tests.expect(result).toContain('use tao@ui Col')
  Tests.expect(fixSource(result)).toBe(result)
})

Tests.test('organizing imports removes duplicates across comment groups and keeps the comments', () => {
  const result = fixSource(S`
    use tao@ui Text
    // Text is used by the primary view.
    use tao@ui Text
    view Main { render Text("Hello") }
  `)
  const importedText = 'use tao@ui Text'
  Tests.expect(result.indexOf(importedText)).toBe(result.lastIndexOf(importedText))
  Tests.expect(result).toContain('// Text is used by the primary view.')
})

Tests.test('organizing imports removes partial duplicates across comment groups', () => {
  const result = fixSource(S`
    use tao@ui Text
    // Keep this group comment.
    use tao@ui Text, Col, Missing as Unresolved
    // Keep this later comment too.
    use tao@ui Col, Missing as Unresolved, Row as Alias
    use tao@ui Badge, Badge,
      // Keep this member comment.
      Badge as Caption, Badge as Caption
    view Main { render Text("Hello") }
  `)
  Tests.expect(result.match(TextImportLineRegx)).toHaveLength(1)
  Tests.expect(result.match(ColImportLineRegx)).toHaveLength(1)
  Tests.expect(result.match(UnresolvedImportAliasRegx)).toHaveLength(1)
  Tests.expect(result).toContain('Row as Alias')
  Tests.expect(result).toContain('use tao@ui Badge, Badge as Caption')
  Tests.expect(result.match(CaptionImportAliasRegx)).toHaveLength(1)
  Tests.expect(result).toContain('// Keep this group comment.')
  Tests.expect(result).toContain('// Keep this later comment too.')
  Tests.expect(result).toContain('// Keep this member comment.')
  Tests.expect(fixSource(result)).toBe(result)
})

Tests.test('organizing duplicate multiline imports retains their interior comments once', () => {
  const result = fixSource(S`
    use tao@ui Text
    use tao@ui Text,
      // Keep this line comment.
      /* Keep this block comment. */
      Text
    view Main { render Text("Hello") }
  `)
  Tests.expect(result.match(CanonicalTextImportRegx)).toHaveLength(1)
  Tests.expect(result.match(PreservedLineCommentRegx)).toHaveLength(1)
  Tests.expect(result.match(PreservedBlockCommentRegx)).toHaveLength(1)
  Tests.expect(fixSource(result)).toBe(result)
})

function fixSource(source: string): string {
  const parser = Grammar.createParser()
  const tree = parser.parse(source)
  const ast = AST.transform(tree)!
  Tests.expect(ast).toBeDefined()
  const result = fix({ source, tree, ast })
  Tests.expect(tree.rootNode.text).toBe(source)
  return format({ source: result.text, tree: parser.parse(result.text) }).text
}
