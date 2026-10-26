import * as AST from '@ast-gen/AST'
import { Errors, Switch } from '@shared'
import type { ModuleBinding } from '@typecheck/Modules'
import { listMap } from './codegen-util'
import { emitStringLiteral, type ScopeCode } from './codegen-util'
import type { DeclarationCompilation } from './DeclarationCompiler'
import { compileInjection } from './InjectionsCompiler'
import {
  type ComponentNames,
  emitForeignView,
  emitViewComponent,
  emitViewDeclaration,
  emitViewRenderBlock,
  emitViewRenderExpression,
} from './RuntimeEmitter'
import { collectTextBindings, compileExpression, compileLetDeclaration, isTextParameter } from './ValuesCompiler'
import { createViewReferences, shadowReferences } from './ViewReferences'

/** ViewCompilationContext provides module-owned names and resolved foreign implementations. */
export type ViewCompilationContext = {
  scope: string
  moduleIdentity: string
  textBindings: ReadonlySet<string>
  foreignComponent: string | undefined
  scopeType: string
  ownerPath?: readonly string[]
  componentPrefix?: string
  resolveForeignComponent?(node: AST.ViewDeclaration): string | undefined
  moduleBindings: readonly ModuleBinding[]
  shadowedNames?: ReadonlySet<string>
}

/** compileViewDeclaration registers a named Tao component or a resolved foreign implementation. */
export function compileViewDeclaration(
  node: AST.ViewDeclaration,
  context: ViewCompilationContext,
): DeclarationCompilation {
  return Switch.kind(node.body, {
    Block: block => compileTaoView(node, block, context),
    ForeignView: () => compileForeignView(node, context),
  })
}

type RenderCompilation = { result: string; components: string }

function compileForeignView(node: AST.ViewDeclaration, context: ViewCompilationContext): DeclarationCompilation {
  if (!node.parameters.every(isTextParameter)) {
    Errors.ThrowUserInput(`Foreign view ${node.name.value} parameters must all use the text type.`)
  }
  const component = context.foreignComponent
    ?? Errors.ThrowShouldNeverHappen(`Missing compiled import for foreign view ${node.name.value}.`)
  return { initialization: emitForeignView(node, context.scope, component), components: '' }
}

function compileTaoView(
  node: AST.ViewDeclaration,
  block: AST.ViewDeclarationBlock,
  context: ViewCompilationContext,
): DeclarationCompilation {
  const definitions = block.statements.filter(AST.IsLetDeclaration)
  const children = block.statements.filter(AST.IsViewDeclaration)
  const render = block.statements.find(isRenderStatement)
    ?? Errors.ThrowShouldNeverHappen(`View ${node.name.value} has no final render statement.`)
  const inheritedText = new Set(context.textBindings)
  for (const child of children) {
    inheritedText.delete(child.name.value)
  }
  const bindings = collectTextBindings(definitions, inheritedText, node.parameters)
  const names = createComponentNames(node, context, definitions, children, bindings)
  const shadowed = new Set([
    ...context.shadowedNames ?? [],
    ...node.parameters.map(item => item.name.value),
    ...definitions.map(item => item.name.value),
    ...children.map(item => item.name.value),
  ])
  const references = createViewReferences(context.moduleBindings, shadowed)
  const nested = compileNestedViews(node, children, { ...context, shadowedNames: shadowed }, names, bindings)
  const values = definitions.map(definition => compileLetDeclaration(definition, references.scope)).join('\n')
  const compiled = compileViewRenderStatement(render, bindings, names, references.scope)
  const statements = [references.initialize(), ...nested.map(child => child.initialization), values].filter(Boolean)
    .join('\n')
  const component = emitViewComponent(names, statements, compiled.result, true)
  const registration = emitViewDeclaration(node, context.scope, `${context.componentPrefix ?? ''}${names.view}`)
  const components = [...nested.map(child => child.components), compiled.components, component]
  return { components: components.filter(Boolean).join('\n'), initialization: registration }
}

function isRenderStatement(node: AST.ViewDeclarationStatement): node is AST.ViewRenderStatement {
  return AST.IsViewRenderStatement(node)
}

function compileNestedViews(
  owner: AST.ViewDeclaration,
  children: readonly AST.ViewDeclaration[],
  context: ViewCompilationContext,
  names: ComponentNames,
  bindings: ReadonlySet<string>,
): DeclarationCompilation[] {
  return children.map(child =>
    compileViewDeclaration(child, {
      ...context,
      scope: names.scope,
      scopeType: names.scopeType,
      ownerPath: [...context.ownerPath ?? [], owner.name.value],
      textBindings: bindings,
      componentPrefix: '',
      foreignComponent: context.resolveForeignComponent?.(child),
    })
  )
}

function compileViewRenderStatement(
  node: AST.ViewRenderStatement,
  bindings: ReadonlySet<string>,
  names: ComponentNames,
  scope: ScopeCode,
): RenderCompilation {
  return Switch.kind(node, {
    RenderViewExpressionStatement: statement => ({
      result: compileViewRenderExpression(statement.expression, scope),
      components: '',
    }),
    RenderInjectStatement(statement) {
      const injection = compileInjection(statement.injection, bindings, names, scope)
      return { result: injection.invocation, components: injection.hookDeclaration }
    },
  })
}

function compileViewRenderExpression(node: AST.ViewRenderExpression, scope: ScopeCode): string {
  const argumentsCode = listMap(node.arguments, argument => compileExpression(argument, scope))
  const children = compileViewRenderBlock(node.block, scope)
  return emitViewRenderExpression(node, scope, argumentsCode, children)
}

function compileViewRenderBlock(block: AST.ViewRenderBlock | undefined, scope: ScopeCode): string {
  if (!block) {
    return '[]'
  }
  const blockScope = shadowReferences(scope, block.statements.filter(AST.IsLetDeclaration))
  if (block.statements.every(isViewRenderExpression)) {
    return listMap(block.statements, child => compileViewRenderExpression(child, scope))
  }
  const statements = block.statements.map(statement => compileBlockStatement(statement, blockScope)).join('\n')
  return emitViewRenderBlock(scope, statements)
}

function isViewRenderExpression(node: AST.ViewRenderBlockStatement): node is AST.ViewRenderExpression {
  return node.kind === 'ViewRenderExpression'
}

function compileBlockStatement(node: AST.ViewRenderBlockStatement, scope: ScopeCode): string {
  return Switch.kind(node, {
    LetDeclaration: declaration => compileLetDeclaration(declaration, scope),
    ViewRenderExpression: expression => `_Children.push(${compileViewRenderExpression(expression, scope)});`,
  })
}

function createComponentNames(
  node: AST.ViewDeclaration,
  context: ViewCompilationContext,
  definitions: readonly AST.LetDeclaration[],
  children: readonly AST.ViewDeclaration[],
  bindings: ReadonlySet<string>,
): ComponentNames {
  const path = [...context.ownerPath ?? [], node.name.value].join('$')
  const identity = `${path}_${context.moduleIdentity}`
  return {
    view: `TaoView_${identity}`,
    useInjection: `useTaoInjection${identity}`,
    props: '_Props',
    render: '_Render',
    scope: '_Scope',
    scopeType: createScopeType(node, context.scopeType, definitions, children, bindings),
  }
}

function createScopeType(
  node: AST.ViewDeclaration,
  inherited: string,
  definitions: readonly AST.LetDeclaration[],
  children: readonly AST.ViewDeclaration[],
  bindings: ReadonlySet<string>,
): string {
  const values = [...node.parameters, ...definitions].map(value => ({
    name: value.name.value,
    type: bindings.has(value.name.value) ? 'string' : 'unknown',
  }))
  const properties = [...values, ...children.map(child => ({ name: child.name.value, type: 'TR.View' }))]
  if (properties.length === 0) {
    return inherited
  }
  const keys = properties.map(property => emitStringLiteral(property.name)).join(' | ')
  const members = properties.map(property => `readonly ${emitStringLiteral(property.name)}: ${property.type}`).join(
    '; ',
  )
  return `Omit<${inherited}, ${keys}> & { ${members} }`
}
