import * as Grammar from '@grammar'
import { S } from '@shared'
import * as Tests from '@shared-tests'

import { transform } from '../ast-gen-src/Transform'

Tests.test('comments between syntax nodes do not become declarations, parameters or reference segments', () => {
  const source = S`
    // Public entry
    package view Main(Value /* parameter type */ text) {
      let Copy = Value
      render UI./* namespace */Text(Copy)
    }
    tests {
      test {
        // Launch
        run Demo
        expect { /* assertion */ text "Hi" }
      }
    }
  `
  const ast = transform(Grammar.createParser().parse(source))!
  Tests.expect(ast.root.block.statements).toHaveLength(2)
  Tests.expect(ast.root.block.statements[0]).toMatchObject({
    kind: 'ViewDeclaration',
    parameters: [{ name: { value: 'Value' }, type: { value: 'text' } }],
    body: {
      statements: [
        { kind: 'LetDeclaration', name: { value: 'Copy' }, value: { value: 'Value' } },
        {
          kind: 'RenderViewExpressionStatement',
          expression: { target: { value: 'UI.Text' }, arguments: [{ value: 'Copy' }] },
        },
      ],
    },
  })
  Tests.expect(ast.root.block.statements[1]).toMatchObject({
    block: {
      statements: [{
        block: {
          statements: [
            { kind: 'RunStatement' },
            { kind: 'ExpectStatement', block: { statements: [{ kind: 'TextExpectation' }] } },
          ],
        },
      }],
    },
  })
})

Tests.test('comments inside a parameter list are not constructed as parameters', () => {
  const source = 'view Main(/* parameter list note */ Value text) { render Text(Value) }'
  const ast = transform(Grammar.createParser().parse(source))!
  Tests.expect(ast.root.block.statements[0]).toMatchObject({
    kind: 'ViewDeclaration',
    parameters: [{ name: { value: 'Value' }, type: { value: 'text' } }],
  })
})
