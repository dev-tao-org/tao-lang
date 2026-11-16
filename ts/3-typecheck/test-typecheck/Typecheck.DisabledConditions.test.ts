import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { S } from '@shared'
import * as Tests from '@shared-tests'
import { linkModules } from '../typecheck-src/Typecheck'

Tests.test('a shadowed text value cannot be used as a boolean disabled condition', () => {
  const source = S`
    let Locked = yes
    view Root {
      render Column [disabled Locked] {
        let Locked = "busy"
        Button [disabled Locked]
      }
    }
  `
  const document = AST.transform(Grammar.createParser().parse(source))!
  const path = 'Disabled.tao'
  Tests.expect(() => linkModules(path, [{ path, document, imports: [], siblings: [] }])).toThrow(
    'The disabled condition on Button in Disabled.tao must be a boolean.',
  )
})
