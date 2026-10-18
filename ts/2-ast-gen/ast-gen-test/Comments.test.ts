import { createParser } from '@grammar/parser'
import { S } from '@shared'
import { Tests } from '@shared/os'
import { transform } from '../ast-gen-src/Transform'

Tests.test('comments between syntax nodes do not become declarations, parameters or reference segments', () => {
  const source = S`
    // Public entry
    public view Main(Value /* parameter type */ text) {
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
  const ast = transform(createParser().parse(source).tree)!
  Tests.expect(ast.root.declarations).toHaveLength(2)
  Tests.expect(ast.root.declarations[0]).toMatchObject({
    kind: 'ViewDeclaration',
    parameters: [{ name: { value: 'Value' }, type: { value: 'text' } }],
    render: { target: { value: 'UI.Text' }, arguments: [{ value: 'Copy' }] },
  })
  Tests.expect(ast.root.declarations[1]).toMatchObject({
    tests: [{ steps: [{ kind: 'RunStatement' }, { expectations: [{ kind: 'TextExpectation' }] }] }],
  })
})
