import * as AST from '@ast-gen'
import { Range } from '@shared'
import * as Tests from '@shared-tests'

import { collectModuleReferences } from '../typecheck-src/LinkModuleValidation'
import { linkModules } from '../typecheck-src/Typecheck'
import * as Fixtures from './Typecheck.test-fixtures.LinkModules'

Tests.test('nested views resolve their sibling group through descendants', () => {
  const grandchild = { ...Fixtures.createView('Grandchild'), body: Fixtures.createViewBlock([render('Peer')]) }
  const child = {
    ...Fixtures.createView('Child'),
    body: Fixtures.createViewBlock([
      render('Col', [
        Fixtures.createViewRender('Peer'),
        Fixtures.createViewRender('Grandchild'),
        Fixtures.createViewRender('Child'),
      ]),
      grandchild,
    ]),
  }
  const owner = {
    ...Fixtures.createView('Main'),
    body: Fixtures.createViewBlock([
      render('Col', [Fixtures.createViewRender('Child'), Fixtures.createViewRender('Peer')]),
      child,
      Fixtures.createView('Peer'),
    ]),
  }
  Tests.expect(collectModuleReferences(Fixtures.createSource('app/main.tao', [owner]).document).names).toEqual(
    new Set(['Col']),
  )
})

Tests.test('nested view names share a scope while child scopes may shadow them', () => {
  const duplicateChildren = {
    ...Fixtures.createView('Main'),
    body: Fixtures.createViewBlock([render('Col'), Fixtures.createView('Card'), Fixtures.createView('Card')]),
  }
  Tests.expect(() => linkModules('app/main.tao', [Fixtures.createSource('app/main.tao', [duplicateChildren])]))
    .toThrow('View Main in app/main.tao declares Card more than once in one scope')

  const shadowingChild = {
    ...Fixtures.createView('Main'),
    body: Fixtures.createViewBlock([
      render('Col'),
      {
        ...Fixtures.createView('Card'),
        body: Fixtures.createViewBlock([Fixtures.createLetDefinition('Card'), render('Card')]),
      },
    ]),
  }
  Tests.expect(() => linkModules('app/main.tao', [Fixtures.createSource('app/main.tao', [shadowingChild])])).not
    .toThrow()
})

function render(
  target: string,
  children: readonly AST.ViewRenderBlockStatement[] = [],
): AST.RenderViewExpressionStatement {
  return {
    kind: 'RenderViewExpressionStatement',
    range: Range(0, 0),
    expression: {
      ...Fixtures.createViewRender(target),
      block: children.length > 0 ? Fixtures.createBlock(children) : undefined,
    },
  }
}
