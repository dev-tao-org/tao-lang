import * as AST from '@ast-gen/AST'
import { Errors, Switch } from '@shared'
import { listMap } from './codegen-util'
import { compileInjection } from './InjectionsCompiler'
import * as RuntimeEmitter from './RuntimeEmitter'
import { collectTextBindings, compileExpression, compileLetDeclaration, isTextParameter } from './ValuesCompiler'

/** ViewCompilationContext provides module-owned names and resolved foreign implementations. */
export type ViewCompilationContext = {
  scope: string
  moduleIdentity: string
  textBindings: ReadonlySet<string>
  foreignComponent: string | undefined
}

/** compileViewDeclaration registers a named Tao component or a resolved foreign implementation. */
export function compileViewDeclaration(node: AST.ViewDeclaration, context: ViewCompilationContext): string {
  return Switch.kind(node.body, {
    Block: block => compileTaoView(node, block, context),
    ForeignView: () => compileForeignView(node, context),
  })
}

type RenderCompilation = { result: string; components: string }

function compileForeignView(node: AST.ViewDeclaration, context: ViewCompilationContext): string {
  if (!node.parameters.every(isTextParameter)) {
    Errors.ThrowUserInput(`Foreign view ${node.name.value} parameters must all use the text type.`)
  }
  const component = context.foreignComponent
    ?? Errors.ThrowShouldNeverHappen(`Missing compiled import for foreign view ${node.name.value}.`)
  return RuntimeEmitter.emitForeignView(node, context.scope, component)
}

function compileTaoView(
  node: AST.ViewDeclaration,
  block: AST.ViewDeclarationBlock,
  context: ViewCompilationContext,
): string {
  const definitions = block.statements.filter(AST.IsLetDeclaration)
  const render = block.statements.find(isRenderStatement)
    ?? Errors.ThrowShouldNeverHappen(`View ${node.name.value} has no final render statement.`)
  const names = createComponentNames(node, context)
  const bindings = collectTextBindings(definitions, context.textBindings, node.parameters)
  const statements = definitions.map(definition => compileLetDeclaration(definition, names.scope)).join('\n')
  const compiled = compileViewRenderStatement(render, bindings, names)
  const needsScope = definitions.length > 0 || render.kind === 'RenderViewExpressionStatement'
  const component = RuntimeEmitter.emitViewComponent(names, statements, compiled.result, needsScope)
  const registration = RuntimeEmitter.emitViewDeclaration(node, context.scope, names.view)
  return [compiled.components, component, registration].filter(Boolean).join('\n')
}

function isRenderStatement(node: AST.ViewDeclarationStatement): node is AST.ViewRenderStatement {
  return node.kind !== 'LetDeclaration'
}

function compileViewRenderStatement(
  node: AST.ViewRenderStatement,
  bindings: ReadonlySet<string>,
  names: RuntimeEmitter.ComponentNames,
): RenderCompilation {
  return Switch.kind(node, {
    RenderViewExpressionStatement: statement => ({
      result: compileViewRenderExpression(statement.expression, names.scope),
      components: '',
    }),
    RenderInjectStatement(statement) {
      const injection = compileInjection(statement.injection, bindings, names)
      return { result: injection.invocation, components: injection.hookDeclaration }
    },
  })
}

function compileViewRenderExpression(node: AST.ViewRenderExpression, scope: string): string {
  const argumentsCode = listMap(node.arguments, argument => compileExpression(argument, scope))
  const children = compileViewRenderBlock(node.block, scope)
  return RuntimeEmitter.emitViewRenderExpression(node, scope, argumentsCode, children)
}

function compileViewRenderBlock(block: AST.ViewRenderBlock | undefined, scope: string): string {
  if (!block) {
    return '[]'
  }
  if (block.statements.every(isViewRenderExpression)) {
    return listMap(block.statements, child => compileViewRenderExpression(child, scope))
  }
  const statements = block.statements.map(statement => compileBlockStatement(statement, scope)).join('\n')
  return RuntimeEmitter.emitViewRenderBlock(scope, statements)
}

function isViewRenderExpression(node: AST.ViewRenderBlockStatement): node is AST.ViewRenderExpression {
  return node.kind === 'ViewRenderExpression'
}

function compileBlockStatement(node: AST.ViewRenderBlockStatement, scope: string): string {
  return Switch.kind(node, {
    LetDeclaration: declaration => compileLetDeclaration(declaration, scope),
    ViewRenderExpression: expression => `_Children.push(${compileViewRenderExpression(expression, scope)});`,
  })
}

function createComponentNames(
  node: AST.ViewDeclaration,
  context: ViewCompilationContext,
): RuntimeEmitter.ComponentNames {
  const identity = `${context.moduleIdentity}_${node.name.value}`
  return {
    view: `TaoView${identity}`,
    useInjection: `useTaoInjection${identity}`,
    props: '_Props',
    render: '_Render',
    scope: '_Scope',
  }
}
