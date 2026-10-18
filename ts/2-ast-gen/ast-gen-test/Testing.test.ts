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
  const { tree } = createParser().parse(source)
  const document = transform(tree)!
  Tests.expect(document.root.declarations[0]).toMatchObject({
    kind: 'TestsDeclaration',
    label: { value: 'Forms' },
    tests: [{
      label: { value: 'Save' },
      steps: [
        { kind: 'RunStatement', app: { value: 'Example' } },
        { kind: 'PressStatement', target: { value: 'save' } },
        { kind: 'TypeStatement', target: { value: 'name' }, value: { value: 'Hello' } },
        { kind: 'ExpectStatement', expectations: [{ kind: 'InputExpectation', target: { value: 'name' } }] },
        { kind: 'ExpectStatement', expectations: [{ kind: 'TextExpectation', value: { value: 'Saved' } }] },
      ],
    }],
  })
  Tests.expect(AST.IsKind(document.root, 'File')).toBe(true)
})
