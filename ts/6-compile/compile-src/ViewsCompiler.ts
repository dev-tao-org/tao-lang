import * as AST from '@ast-gen'
import { Errors, NewlineCharacter, Switch, UserInput } from '@shared'
import type * as Typecheck from '@typecheck'

import { compileActionDeclaration, compilePressBinding } from './ActionsCompiler'
import * as CodegenUtil from './codegen-util'
import type { DeclarationCompilation } from './DeclarationCompiler'
import { compileInjection } from './InjectionsCompiler'
import * as RuntimeEmitter from './RuntimeEmitter'
import * as ValuesCompiler from './ValuesCompiler'
import { createViewReferences, shadowReferences, type ViewReferences } from './ViewReferences'

/** ViewCompilationContext provides module-owned names and resolved foreign implementations. */
export type ViewCompilationContext = {
  scope: string
  moduleIdentity: string
  textBindings: ReadonlySet<string>
  foreignComponent: OptionalForeignComponent
  scopeType: string
  ownerPath?: readonly string[]
  componentPrefix?: string
  resolveForeignComponent?(node: AST.ViewDeclaration): string | undefined
  moduleBindings: readonly Typecheck.ModuleBinding[]
  shadowedNames?: ReadonlySet<string>
  liveLocalAliases?: boolean
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
  if (!node.parameters.every(ValuesCompiler.isTextParameter)) {
    UserInput.fail(`Foreign view ${node.name.value} parameters must all use the text type.`)
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
  const inputs = createTaoViewCompileInputs(node, block, context)
  const nested = compileNestedViews(
    node,
    inputs.children,
    createNestedOwnerContext(context, inputs),
    inputs.names,
    inputs.textBindings,
  )
  const valuesCode = compileViewBindings(inputs)
  const compiled = compileViewRenderStatement(
    inputs.render,
    inputs.textBindings,
    inputs.names,
    inputs.references.scope,
  )
  return registerTaoView(node, context, inputs.names, nested, inputs.references, compiled, valuesCode)
}

type ViewScopeDeclarations = {
  actions: readonly AST.ActionDeclaration[]
  children: readonly AST.ViewDeclaration[]
  definitions: readonly AST.ViewValueDeclaration[]
}

type TaoViewCompileInputs = ViewScopeDeclarations & {
  liveLocalAliases: boolean
  names: RuntimeEmitter.ComponentNames
  references: ViewReferences
  render: AST.ViewRenderStatement
  shadowed: Set<string>
  textBindings: ReadonlySet<string>
}

function createTaoViewCompileInputs(
  node: AST.ViewDeclaration,
  block: AST.Block,
  context: ViewCompilationContext,
): TaoViewCompileInputs {
  const declarations = collectViewScopeDeclarations(block)
  const { actions, children, definitions } = declarations
  const render = AST.FindViewRenderStatement(block)
  if (render === undefined) {
    Errors.ThrowShouldNeverHappen(`View ${node.name.value} has no final render statement.`)
  }
  const textBindings = new Set(context.textBindings)
  for (const child of children) {
    textBindings.delete(child.name.value)
  }
  for (const action of actions) {
    textBindings.delete(action.name.value)
  }
  const bindings = ValuesCompiler.collectTextBindings(definitions, textBindings, node.parameters)
  const shadowed = new Set([
    ...context.shadowedNames ?? [],
    ...node.parameters.map(item => item.name.value),
    ...definitions.map(item => item.name.value),
    ...children.map(item => item.name.value),
    ...actions.map(item => item.name.value),
  ])
  const liveLocalAliases = context.liveLocalAliases ?? false
  const hasState = definitions.some(definition => AST.IsKind(definition, 'StateDeclaration'))
  const trackState = liveLocalAliases || hasState
  const names = createComponentNames(node, context, declarations, bindings)
  return {
    ...declarations,
    liveLocalAliases: trackState,
    names,
    references: createViewReferences(context.moduleBindings, shadowed, trackState),
    render,
    shadowed,
    textBindings: bindings,
  }
}

function collectViewScopeDeclarations(block: AST.Block): ViewScopeDeclarations {
  const actions: AST.ActionDeclaration[] = []
  const children: AST.ViewDeclaration[] = []
  const definitions: AST.ViewValueDeclaration[] = []
  for (const statement of block.statements) {
    if (AST.IsKind(statement, 'ActionDeclaration')) {
      actions.push(statement)
    } else if (AST.IsViewDeclaration(statement)) {
      children.push(statement)
    } else if (AST.IsKind(statement, ['LetDeclaration', 'StateDeclaration'])) {
      definitions.push(statement)
    } else {
      // Render statements introduce no scope bindings.
    }
  }
  return { actions, children, definitions }
}

function compileViewBindings(inputs: TaoViewCompileInputs): string {
  const scope = inputs.references.scope
  const values = inputs.definitions.map(definition => ValuesCompiler.compileViewValueDeclaration(definition, scope))
  const actions = inputs.actions.map(action => compileActionDeclaration(action, scope))
  return CodegenUtil.joinCodeLines(...values, ...actions)
}

function registerTaoView(
  node: AST.ViewDeclaration,
  context: ViewCompilationContext,
  names: RuntimeEmitter.ComponentNames,
  nested: readonly DeclarationCompilation[],
  references: ViewReferences,
  compiled: RenderCompilation,
  valuesCode: string,
): DeclarationCompilation {
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
  inputs: TaoViewCompileInputs,
): ViewCompilationContext {
  return { ...context, shadowedNames: inputs.shadowed, liveLocalAliases: inputs.liveLocalAliases }
}

function compileNestedViews(
  owner: AST.ViewDeclaration,
  children: readonly AST.ViewDeclaration[],
  context: ViewCompilationContext,
  names: RuntimeEmitter.ComponentNames,
  bindings: ReadonlySet<string>,
): DeclarationCompilation[] {
  return children.map(child =>
    compileViewDeclaration(child, createChildViewContext(owner, child, context, names, bindings))
  )
}

function createChildViewContext(
  owner: AST.ViewDeclaration,
  child: AST.ViewDeclaration,
  context: ViewCompilationContext,
  names: RuntimeEmitter.ComponentNames,
  textBindings: ReadonlySet<string>,
): ViewCompilationContext {
  const ownerPath = [...context.ownerPath ?? [], owner.name.value]
  const foreignComponent = context.resolveForeignComponent?.(child)
  return {
    ...context,
    scope: names.scope,
    scopeType: names.scopeType,
    ownerPath,
    textBindings,
    componentPrefix: '',
    foreignComponent,
  }
}

function compileViewRenderStatement(
  node: AST.ViewRenderStatement,
  bindings: ReadonlySet<string>,
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
      const injection = compileInjection(statement.injection, bindings, names, scope)
      return RenderCompilation(injection.invocation, injection.hookDeclaration)
    },
  })
}

function compileViewRenderExpression(node: AST.ViewRenderExpression, scope: CodegenUtil.ScopeCode): string {
  const argumentsCode = ValuesCompiler.compileArguments(node, scope)
  const block = node.block
  if (!block || AST.HasOnlyViewRenderExpressions(block)) {
    const children = CodegenUtil.listMap(
      AST.GetViewRenderExpressions(block?.statements ?? []),
      child => compileViewRenderExpression(child, scope),
    )
    return RuntimeEmitter.emitViewRenderExpression(node, scope, argumentsCode, children, false)
  }
  return compileViewRenderBlock(node, block, scope, argumentsCode)
}

function compileViewRenderBlock(
  node: AST.ViewRenderExpression,
  block: AST.Block,
  scope: CodegenUtil.ScopeCode,
  argumentsCode: string,
): string {
  const blockScope = shadowReferences(scope, AST.GetLetDeclarations(block.statements))
  const hasPress = block.statements.some(statement => AST.IsKind(statement, 'PressBinding'))
  const statements = block.statements.map(statement => compileBlockStatement(statement, blockScope)).join(
    NewlineCharacter,
  )
  const children = RuntimeEmitter.emitViewRenderBlock(scope, statements, hasPress)
  return RuntimeEmitter.emitViewRenderExpression(node, scope, argumentsCode, children, hasPress)
}

type OptionalForeignComponent = string | undefined

function compileBlockStatement(node: AST.Statement, scope: CodegenUtil.ScopeCode): string {
  if (AST.IsLetDeclaration(node)) {
    return ValuesCompiler.compileLetDeclaration(node, scope)
  }
  if (AST.IsViewRenderExpression(node)) {
    return `_Children.push(${compileViewRenderExpression(node, scope)});`
  }
  if (AST.IsKind(node, 'PressBinding')) {
    return compilePressBinding(node, scope)
  }
  return Errors.ThrowShouldNeverHappen(`Unexpected ${node.kind} in a validated render block.`)
}

function createComponentNames(
  node: AST.ViewDeclaration,
  context: ViewCompilationContext,
  declarations: ViewScopeDeclarations,
  bindings: ReadonlySet<string>,
): RuntimeEmitter.ComponentNames {
  const path = [...context.ownerPath ?? [], node.name.value].join('$')
  const identity = `${path}_${context.moduleIdentity}`
  return {
    view: `TaoView_${identity}`,
    useInjection: `useTaoInjection${identity}`,
    props: '_Props',
    render: '_Render',
    scope: '_Scope',
    scopeType: createScopeType(node, context.scopeType, declarations, bindings),
  }
}

function createScopeType(
  node: AST.ViewDeclaration,
  inherited: string,
  declarations: ViewScopeDeclarations,
  bindings: ReadonlySet<string>,
): string {
  const values = [...node.parameters, ...declarations.definitions].map(value => ({
    name: value.name.value,
    type: bindings.has(value.name.value) ? 'string' : 'unknown',
  }))
  const views = declarations.children.map(child => ({ name: child.name.value, type: 'TR.View' }))
  const actions = declarations.actions.map(action => ({ name: action.name.value, type: 'unknown' }))
  const properties = [...values, ...views, ...actions]
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
