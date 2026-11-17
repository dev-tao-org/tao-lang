import * as AST from '@ast-gen'
import { Errors, NewlineCharacter, Switch } from '@shared'
import type * as Typecheck from '@typecheck'

import * as CodegenUtil from './codegen-util'
import type { DeclarationCompilation } from './DeclarationCompiler'
import { compileInjection } from './InjectionsCompiler'
import * as RuntimeEmitter from './RuntimeEmitter'
import * as ValuesCompiler from './ValuesCompiler'
import { createViewReferences, shadowReferences } from './ViewReferences'

/** ViewCompilationContext provides module-owned names and resolved foreign implementations. */
export type ViewCompilationContext = {
  scope: string
  moduleIdentity: string
  resolvePrimitiveType: Typecheck.PrimitiveBindingScope
  foreignComponent: OptionalForeignComponent
  scopeType: string
  ownerPath?: readonly string[]
  componentPrefix?: string
  resolveForeignComponent?(node: AST.ViewDeclaration): string | undefined
  moduleBindings: readonly Typecheck.ModuleBinding[]
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
const RenderCompilation = (result: string, components: string): RenderCompilation => ({ result, components })

function compileForeignView(node: AST.ViewDeclaration, context: ViewCompilationContext): DeclarationCompilation {
  if (!ValuesCompiler.hasSupportedViewParameters(node)) {
    Errors.ThrowUserInput(`Foreign view ${node.name.value} parameters must all use text or boolean.`)
  }
  const component = context.foreignComponent
  if (component === undefined) {
    Errors.ThrowShouldNeverHappen(`Missing compiled import for foreign view ${node.name.value}.`)
  }
  return { initialization: RuntimeEmitter.emitForeignView(node, context.scope, component), components: '' }
}

function compileTaoView(
  node: AST.ViewDeclaration,
  block: AST.Block,
  context: ViewCompilationContext,
): DeclarationCompilation {
  const definitions = AST.GetLetDeclarations(block.statements)
  const children = AST.GetNestedViewDeclarations(block.statements)
  const render = AST.FindViewRenderStatement(block)
  if (render === undefined) {
    Errors.ThrowShouldNeverHappen(`View ${node.name.value} has no final render statement.`)
  }
  const resolveType = ValuesCompiler.createViewPrimitiveScope(
    context.resolvePrimitiveType,
    definitions,
    node.parameters,
    children,
  )
  const names = createComponentNames(node, context, definitions, children, resolveType)
  const shadowed = new Set([
    ...context.shadowedNames ?? [],
    ...node.parameters.map(item => item.name.value),
    ...definitions.map(item => item.name.value),
    ...children.map(item => item.name.value),
  ])
  const references = createViewReferences(context.moduleBindings, shadowed)
  const nestedContext = createNestedOwnerContext(context, shadowed)
  const nested = compileNestedViews(node, children, nestedContext, names, resolveType)
  const valuesCode = definitions.map(definition => ValuesCompiler.compileLetDeclaration(definition, references.scope))
    .join(
      NewlineCharacter,
    )
  const compiled = compileViewRenderStatement(render, resolveType, names, references.scope)
  const statements = CodegenUtil.joinCodeLines(
    references.initialize(),
    ...nested.map(child => child.initialization),
    valuesCode,
  )
  const component = RuntimeEmitter.emitViewComponent(names, statements, compiled.result, true)
  const registration = RuntimeEmitter.emitViewDeclaration(
    node,
    context.scope,
    `${context.componentPrefix ?? ''}${names.view}`,
  )
  const components = CodegenUtil.joinCodeLines(...nested.map(child => child.components), compiled.components, component)
  return { components, initialization: registration }
}

function createNestedOwnerContext(
  context: ViewCompilationContext,
  shadowedNames: ReadonlySet<string>,
): ViewCompilationContext {
  return { ...context, shadowedNames }
}

function compileNestedViews(
  owner: AST.ViewDeclaration,
  children: readonly AST.ViewDeclaration[],
  context: ViewCompilationContext,
  names: RuntimeEmitter.ComponentNames,
  resolveType: Typecheck.PrimitiveBindingScope,
): DeclarationCompilation[] {
  return children.map(child =>
    compileViewDeclaration(child, createChildViewContext(owner, child, context, names, resolveType))
  )
}

function createChildViewContext(
  owner: AST.ViewDeclaration,
  child: AST.ViewDeclaration,
  context: ViewCompilationContext,
  names: RuntimeEmitter.ComponentNames,
  resolvePrimitiveType: Typecheck.PrimitiveBindingScope,
): ViewCompilationContext {
  const ownerPath = [...context.ownerPath ?? [], owner.name.value]
  const foreignComponent = context.resolveForeignComponent?.(child)
  return {
    ...context,
    scope: names.scope,
    scopeType: names.scopeType,
    ownerPath,
    resolvePrimitiveType,
    componentPrefix: '',
    foreignComponent,
  }
}

function compileViewRenderStatement(
  node: AST.ViewRenderStatement,
  resolveType: Typecheck.PrimitiveBindingScope,
  names: RuntimeEmitter.ComponentNames,
  scope: CodegenUtil.ScopeCode,
): RenderCompilation {
  return Switch.kind(node, {
    RenderViewExpressionStatement: statement =>
      RenderCompilation(
        compileViewRenderExpression(statement.expression, scope),
        '',
      ),
    RenderInjectStatement(statement) {
      const injection = compileInjection(statement.injection, resolveType, names, scope)
      return RenderCompilation(injection.invocation, injection.hookDeclaration)
    },
  })
}

function compileViewRenderExpression(node: AST.ViewRenderExpression, scope: CodegenUtil.ScopeCode): string {
  const argumentsCode = CodegenUtil.listMap(
    node.arguments,
    argument => ValuesCompiler.compileExpression(argument, scope),
  )
  const childrenCode = compileViewRenderBlock(node.block, scope)
  const condition = node.interaction ? ValuesCompiler.compileExpression(node.interaction.condition, scope) : undefined
  return RuntimeEmitter.emitViewRenderExpression(node, scope, argumentsCode, childrenCode, condition)
}

type OptionalViewRenderBlock = AST.Block | undefined
function compileViewRenderBlock(block: OptionalViewRenderBlock, scope: CodegenUtil.ScopeCode): string {
  if (!block) {
    return '[]'
  }
  const blockScope = shadowReferences(scope, AST.GetLetDeclarations(block.statements))
  if (AST.HasOnlyViewRenderExpressions(block)) {
    return CodegenUtil.listMap(
      AST.GetViewRenderExpressions(block.statements),
      child => compileViewRenderExpression(child, scope),
    )
  }
  const statements = block.statements.map(statement => compileBlockStatement(statement, blockScope)).join(
    NewlineCharacter,
  )
  return RuntimeEmitter.emitViewRenderBlock(scope, statements)
}

type OptionalForeignComponent = string | undefined

function compileBlockStatement(node: AST.Statement, scope: CodegenUtil.ScopeCode): string {
  if (AST.IsLetDeclaration(node)) {
    return ValuesCompiler.compileLetDeclaration(node, scope)
  }
  if (AST.IsViewRenderExpression(node)) {
    return `_Children.push(${compileViewRenderExpression(node, scope)});`
  }
  return Errors.ThrowShouldNeverHappen(`Unexpected ${node.kind} in a validated render block.`)
}

function createComponentNames(
  node: AST.ViewDeclaration,
  context: ViewCompilationContext,
  definitions: readonly AST.LetDeclaration[],
  children: readonly AST.ViewDeclaration[],
  resolveType: Typecheck.PrimitiveBindingScope,
): RuntimeEmitter.ComponentNames {
  const path = [...context.ownerPath ?? [], node.name.value].join('$')
  const identity = `${path}_${context.moduleIdentity}`
  return {
    view: `TaoView_${identity}`,
    useInjection: `useTaoInjection${identity}`,
    props: '_Props',
    render: '_Render',
    scope: '_Scope',
    scopeType: createScopeType(node, context.scopeType, definitions, children, resolveType),
  }
}

function createScopeType(
  node: AST.ViewDeclaration,
  inherited: string,
  definitions: readonly AST.LetDeclaration[],
  children: readonly AST.ViewDeclaration[],
  resolveType: Typecheck.PrimitiveBindingScope,
): string {
  const values = [...node.parameters, ...definitions].map(value => {
    const name = value.name.value
    const primitiveType = resolveType(name)
    return { name, type: primitiveType === undefined ? 'unknown' : ValuesCompiler.projectPrimitiveType(primitiveType) }
  })
  const properties = [...values, ...children.map(child => ({ name: child.name.value, type: 'TR.View' }))]
  if (properties.length === 0) {
    return inherited
  }
  const keys = properties.map(property => CodegenUtil.emitStringLiteral(property.name)).join(' | ')
  const members = properties.map(property =>
    `readonly ${CodegenUtil.emitStringLiteral(property.name)}: ${property.type}`
  ).join(
    '; ',
  )
  return `Omit<${inherited}, ${keys}> & { ${members} }`
}
