import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { S } from '@shared'
import { Tests } from '@shared/os'
import { unusedWarnings } from '../typecheck-src/Usage'

Tests.test('unused warnings follow lexical bindings, captures and namespace uses without treating exports as unused', () => {
  const source = S`
    use Text, Col, Text as Caption from tao@ui
    use package tao@ui as UI
    use package @tao/other as Other
    use package @tao/widgets
    use all from ./UnusedWildcard
    app Demo { root Main }
    let Unused = "keep me"
    public let Published = "available elsewhere"
    folder view Sibling { render UI.Text("sibling") }
    view Main(Caption text) {
      let Title = "Hello"
      render Col {
        let Title = "Inner"
        Text(Title)
        Native(Caption)
        widgets.Panel
      }
    }
    view Native(Value text, Spare text) {
      render inject Local Value, Children @@children \`\`\`ts return Local \`\`\`
    }
    tests { test { run Demo } }
  `
  const ast = transform(createParser().parse(source).tree)!
  Tests.expect(ast).toBeDefined()
  const warnings = unusedWarnings(ast)
  Tests.expect(warnings.map(warning => [warning.code, source.slice(warning.start, warning.end)]))
    .toEqual([
      ['unused-import', 'Caption'],
      ['unused-import', 'Other'],
      ['unused-declaration', 'Unused'],
      ['unused-declaration', 'Title'],
      ['unused-declaration', 'Spare'],
    ])
  Tests.expect(warnings.every(warning => warning.severity === 'warning')).toBe(true)
  Tests.expect(ast.root.declarations).toHaveLength(12)
})

Tests.test('qualified namespace use ignores an ordinary local binding with the same head', () => {
  const source = S`
    use package tao@ui as UI
    app Demo { root Main }
    view Main {
      let UI = "unused"
      render UI.Text("shown")
    }
  `
  const ast = transform(createParser().parse(source).tree)!
  Tests.expect(unusedWarnings(ast).map(warning => [warning.code, source.slice(warning.start, warning.end)]))
    .toEqual([['unused-declaration', 'UI']])
})
