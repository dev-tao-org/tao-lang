import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'

import { S, Source } from '@shared'

import { unusedWarnings } from '../typecheck-src/Typecheck'

Tests.test('unused warnings follow lexical bindings, captures and namespace uses without treating exports as unused', () => {
  const source = S`
    use tao@ui Text, Col, Text as Caption
    use package tao@ui as UI
    use package @tao/other as Other
    use package @tao/widgets
    use ./UnusedWildcard all
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
  const ast = AST.transform(Grammar.createParser().parse(source))!
  Tests.expect(ast).toBeDefined()
  const warnings = unusedWarnings(ast)
  Tests.expect(warnings.map(warning => [warning.code, Source.slice(source, warning)]))
    .toEqual([
      ['unused-import', 'Caption'],
      ['unused-import', 'Other'],
      ['unused-declaration', 'Unused'],
      ['unused-declaration', 'Title'],
      ['unused-declaration', 'Spare'],
    ])
  Tests.expect(warnings.every(warning => warning.severity === 'warning')).toBe(true)
  Tests.expect(AST.GetDeclarations(ast)).toHaveLength(12)
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
  const ast = AST.transform(Grammar.createParser().parse(source))!
  Tests.expect(unusedWarnings(ast).map(warning => [warning.code, Source.slice(source, warning)]))
    .toEqual([['unused-declaration', 'UI']])
})

Tests.test('foreign view parameters are consumed by the external view contract', () => {
  const source = S`
    public view External(Value text, Optional text) from ./External.tsx
  `
  const ast = AST.transform(Grammar.createParser().parse(source))!
  Tests.expect(unusedWarnings(ast)).toEqual([])
})

Tests.test('nested view bindings and parameters follow their lexical owner', () => {
  const source = S`
    app Demo { root Main }
    view Main {
      render Col { Greeting }
      view Greeting(Name text) { render Text(Name) }
      view UnusedHelper { render Text("unused") }
    }
  `
  const ast = AST.transform(Grammar.createParser().parse(source))!
  Tests.expect(unusedWarnings(ast).map(warning => Source.slice(source, warning))).toEqual([
    'UnusedHelper',
  ])
  Tests.expect(AST.GetDeclarations(ast)).toHaveLength(2)
})
