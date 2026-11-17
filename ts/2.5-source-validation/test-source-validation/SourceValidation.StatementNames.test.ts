import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { S, Source } from '@shared'
import * as Tests from '@shared-tests'
import * as SourceValidation from '../source-validation-src/SourceValidation'

Tests.test('a file-scope publication parses but fails statement placement validation', () => {
  const tree = Grammar.createParser().parse('publish { Main, }')
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = AST.transform(tree)!
  const diagnostics = SourceValidation.collectStatementDiagnostics(document)
  Tests.expect(diagnostics).toHaveLength(1)
  Tests.expect(diagnostics[0]!.message).toBe('Publish declarations belong directly inside a ts-library.')
  Tests.expect(Source.slice('publish { Main, }', diagnostics[0]!)).toBe('publish { Main, }')
})

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
    ts-library library { publish { Main } }
  `
  const tree = Grammar.createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = AST.transform(tree)!
  const diagnostics = SourceValidation.collectStatementDiagnostics(document)
  const names = diagnostics.map(diagnostic => Source.slice(source, diagnostic))
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
  ])
})
