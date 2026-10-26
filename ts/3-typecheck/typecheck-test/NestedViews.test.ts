import * as AST from '@ast-gen/AST'
import { Tests } from '@shared/os'
import { linkModules } from '../typecheck-src/LinkModules'
import { collectReferencedNames } from '../typecheck-src/LinkModuleValidation'
import type { SourceModule } from '../typecheck-src/Modules'

Tests.test('nested views resolve their sibling group through descendants', () => {
  const grandchild = { ...view('Grandchild'), body: viewBlock([render('Peer')]) }
  const child = {
    ...view('Child'),
    body: viewBlock([
      render('Col', [viewRender('Peer'), viewRender('Grandchild'), viewRender('Child')]),
      grandchild,
    ]),
  }
  const owner = {
    ...view('Main'),
    body: viewBlock([render('Col', [viewRender('Child'), viewRender('Peer')]), child, view('Peer')]),
  }
  Tests.expect(collectReferencedNames(source([owner]).document)).toEqual(new Set(['Col']))
})

Tests.test('nested view names share a scope while child scopes may shadow them', () => {
  const duplicateChildren = {
    ...view('Main'),
    body: viewBlock([render('Col'), view('Card'), view('Card')]),
  }
  Tests.expect(() => linkModules('app/main.tao', [source([duplicateChildren])]))
    .toThrow('View Main in app/main.tao declares Card more than once in one scope')

  const shadowingChild = {
    ...view('Main'),
    body: viewBlock([
      render('Col'),
      { ...view('Card'), body: viewBlock([letDefinition('Card'), render('Card')]) },
    ]),
  }
  Tests.expect(() => linkModules('app/main.tao', [source([shadowingChild])])).not.toThrow()
})

function source(declarations: readonly AST.Declaration[]): SourceModule {
  return {
    path: 'app/main.tao',
    document: { root: { kind: 'File', start: 0, end: 0, block: block(declarations) } },
    imports: [],
    siblings: [],
  }
}

function view(name: string): AST.ViewDeclaration {
  return {
    kind: 'ViewDeclaration',
    start: 0,
    end: 0,
    name: identifier(name),
    visibility: 'file',
    parameters: [],
    body: viewBlock([{
      kind: 'RenderInjectStatement',
      start: 0,
      end: 0,
      injection: { kind: 'Injection', start: 0, end: 0, captures: [], code: '' },
    }]),
  }
}

function viewRender(target: string): AST.ViewRenderExpression {
  return {
    kind: 'ViewRenderExpression',
    start: 0,
    end: 0,
    tag: undefined,
    target: identifier(target),
    arguments: [],
    block: undefined,
  }
}

function render(
  target: string,
  children: readonly AST.ViewRenderBlockStatement[] = [],
): AST.RenderViewExpressionStatement {
  return {
    kind: 'RenderViewExpressionStatement',
    start: 0,
    end: 0,
    expression: {
      ...viewRender(target),
      block: children.length > 0 ? block(children) : undefined,
    },
  }
}

function letDefinition(name: string): AST.LetDeclaration {
  return {
    kind: 'LetDeclaration',
    start: 0,
    end: 0,
    name: identifier(name),
    type: undefined,
    value: { kind: 'TextLiteral', start: 0, end: 0, value: 'shadow' },
    visibility: undefined,
  }
}

function viewBlock(statements: readonly AST.ViewDeclarationStatement[]): AST.ViewDeclarationBlock {
  return block(statements)
}

function block<Statement extends AST.Node>(statements: readonly Statement[]): AST.Block<Statement> {
  return { kind: 'Block', start: 0, end: 0, statements }
}

function identifier(value: string): AST.Name {
  return { kind: 'Name', start: 0, end: value.length, value }
}
