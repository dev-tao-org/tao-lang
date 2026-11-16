import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { S, Source } from '@shared'
import * as Tests from '@shared-tests'
import * as Typecheck from '../typecheck-src/Typecheck'

Tests.test('statement diagnostics identify every explicitly authored lowercase declaration name', () => {
  const source = S`
    requires file:../helpers as dependency
    use tao@ui sdkValue, Text as textAlias
    use package ./helpers as namespace

    app example { root Main }
    let local = sdkValue
    view Main(Value text) { render Text(Value) }
    view viewer(argument text) {
      render inject capture argument \`\`\`ts return capture \`\`\`
    }
    ts-library library { publish { Main as exportName } }
  `
  const tree = Grammar.createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = AST.transform(tree)!
  const names = Typecheck.collectStatementDiagnostics(document).map(diagnostic => Source.slice(source, diagnostic))
  Tests.expect(names).toEqual([
    'dependency',
    'textAlias',
    'namespace',
    'example',
    'local',
    'viewer',
    'argument',
    'capture',
    'library',
    'exportName',
  ])
})
