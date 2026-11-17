import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { S } from '@shared'
import * as Tests from '@shared-tests'
import { linkModules } from '../typecheck-src/Typecheck'

Tests.test('an unlabelled text argument cannot pick among several named roles', () => {
  const path = 'Calculations.tao'
  const source = S`
    func Compose(Left text, Right text) {
      return "{ Left }{ Right }"
    }
    let Ambiguous = Compose("one")
  `
  const document = AST.transform(Grammar.createParser().parse(source))!
  Tests.expect(() => linkModules(path, [{ path, document, imports: [], siblings: [] }]))
    .toThrow('This text argument matches several roles')
})
