import * as AST from '@ast-gen/AST'
import { createParser } from '@grammar/parser'
import { S } from '@shared'
import { Tests } from '@shared/os'
import { transform } from '../ast-gen-src/Transform'

Tests.test('test suites become tagged app actions and grouped assertions', () => {
  const source = S`
    tests "Forms" {
      test "Save" {
        run Example
        press #save
        type "Hello" into #name
        expect #name input value "Hello"
        expect { text "Saved" }
      }
    }
  `
  const tree = createParser().parse(source)
  const document = transform(tree)!
  Tests.expect(document.root.block.statements[0]).toMatchObject({
    kind: 'TestsDeclaration',
    label: { value: 'Forms' },
    block: {
      kind: 'Block',
      statements: [{
        label: { value: 'Save' },
        block: {
          kind: 'Block',
          statements: [
            { kind: 'RunStatement', app: { value: 'Example' } },
            { kind: 'PressStatement', target: { value: 'save' } },
            { kind: 'TypeStatement', target: { value: 'name' }, value: { value: 'Hello' } },
            { kind: 'ExpectStatement', expectation: { kind: 'InputExpectation', target: { value: 'name' } } },
            {
              kind: 'ExpectStatement',
              block: { kind: 'Block', statements: [{ kind: 'TextExpectation', value: { value: 'Saved' } }] },
            },
          ],
        },
      }],
    },
  })
  Tests.expect(AST.IsKind(document.root, 'File')).toBe(true)
})
