import * as AST from '@ast-gen'
import { Switch, UserInput } from '@shared'
import * as Scalars from './ScalarTypes'

/** ViewBinding describes a declaration visible in a view's lexical scope. */
export type ViewBinding = AST.ViewDeclaration | AST.ActionDeclaration | ValueBinding

/** ResolveModuleValue looks up a resolved declaration or text value in the view's module. */
export type ResolveModuleValue = (name: string) => ViewBinding | undefined

/** assertValidViewScopes validates local declarations, text writes, action calls and event targets. */
export function assertValidViewScopes(
  document: AST.Document,
  types: Scalars.ScalarTypeScope,
  resolveModule: ResolveModuleValue,
  viewTypes: ViewTypeScopes,
): void {
  const scope: Scope = { parent: undefined, locals: new Map(), resolveModule, types, viewTypes }
  for (const view of AST.GetViewDeclarations(document)) {
    assertValidView(view, scope, types.path)
  }
}

type ValueBinding = ScalarBinding | { kind: 'other' }
type ScalarBinding = { kind: 'scalar'; type: Scalars.ScalarType; writable: boolean }

/** scalarBinding describes a lexical scalar with its static domain and write authority. */
export function scalarBinding(type: Scalars.ScalarType, writable = false): ScalarBinding {
  return { kind: 'scalar', type, writable }
}

type OptionalScope = Scope | undefined
type ViewTypeScopes = ReadonlyMap<AST.ViewDeclaration, Scalars.ScalarTypeScope>
type Scope = {
  parent: OptionalScope
  locals: Map<string, ViewBinding>
  resolveModule: ResolveModuleValue
  types: Scalars.ScalarTypeScope
  viewTypes: ViewTypeScopes
}
type ViewOwner = { view: string; path: string }

const OtherBinding: ValueBinding = { kind: 'other' }

function assertValidView(node: AST.ViewDeclaration, parent: Scope, path: string): void {
  const owner = { view: node.name.value, path }
  const statements = AST.GetViewDeclarationStatements(node) ?? []
  const scope = createChildScope(parent)
  declareParameters(node.parameters, scope, owner)
  const actions = declareDeferredBindings(statements, scope, owner)
  for (const statement of statements) {
    Switch.kind(statement, {
      ActionDeclaration: Switch.nothing,
      ViewDeclaration: view => assertValidView(view, scope, path),
      LetDeclaration: definition => declareLet(definition, scope, owner),
      StateDeclaration: definition => declareState(definition, scope, owner),
      RenderViewExpressionStatement: render => assertValidRender(render.expression, scope, owner),
      RenderInjectStatement: render => assertValueCaptures(render.injection, scope, owner),
    })
  }
  for (const action of actions) {
    const actionScope = createChildScope(scope)
    declareParameters(action.parameters, actionScope, owner)
    assertValidActionBody(action.block, actionScope, owner)
  }
}

function declareDeferredBindings(
  statements: readonly AST.ViewDeclarationStatement[],
  scope: Scope,
  owner: ViewOwner,
): AST.ActionDeclaration[] {
  const actions: AST.ActionDeclaration[] = []
  for (const statement of statements) {
    if (AST.IsKind(statement, ['ViewDeclaration', 'ActionDeclaration'])) {
      declare(scope, statement.name, statement, owner)
    }
    if (AST.IsKind(statement, 'ActionDeclaration')) {
      actions.push(statement)
    }
  }
  return actions
}

function declareLet(node: AST.LetDeclaration, scope: Scope, owner: ViewOwner): void {
  const value = resolveExpression(scope, node.value)
  assertValue(value, owner, node.value)
  const binding = value?.kind === 'scalar' ? scalarBinding(value.type) : value ?? OtherBinding
  declare(scope, node.name, binding, owner)
}

function declareState(node: AST.StateDeclaration, scope: Scope, owner: ViewOwner): void {
  const type = requireScalarValue(node.value, scope, owner)
  declare(scope, node.name, scalarBinding(type, true), owner)
}

function declareParameters(parameters: readonly AST.Parameter[], scope: Scope, owner: ViewOwner): void {
  for (const parameter of parameters) {
    const type = scope.types.resolve(parameter.type)
    if (type !== Scalars.TextType && type !== Scalars.NumberType) {
      reject(owner, parameter.type, 'Parameters currently require text or number.')
    }
    declare(scope, parameter.name, scalarBinding(type), owner)
  }
}

function assertValidRender(node: AST.ViewRenderExpression, scope: Scope, owner: ViewOwner): void {
  const target = resolve(scope, node.target.value)
  assertRenderTarget(node.target, target, owner)
  assertRenderArguments(node.arguments, target, scope, owner)
  const statements = AST.GetViewRenderBlockStatements(node)
  if (statements.length === 0) {
    return
  }
  const children = createChildScope(scope)
  for (const statement of statements) {
    Switch.kind(statement, {
      LetDeclaration: definition => declareLet(definition, children, owner),
      PressBinding: binding => assertValidPress(binding, target, children, owner),
      ViewRenderExpression: expression => assertValidRender(expression, children, owner),
    })
  }
}

function assertRenderTarget(target: AST.Name, binding: OptionalBinding, owner: ViewOwner): void {
  if (binding?.kind === 'scalar') {
    reject(owner, target, `${target.value} is ${binding.type.name} and cannot be rendered as a view.`)
  }
  assertValue(binding, owner, target)
}

function assertRenderArguments(
  args: readonly AST.Expression[],
  target: OptionalBinding,
  scope: Scope,
  owner: ViewOwner,
): void {
  const view = target?.kind === 'ViewDeclaration' ? target : undefined
  const types = view && scope.viewTypes.get(view) || scope.types
  for (const [index, argument] of args.entries()) {
    const value = resolveExpression(scope, argument)
    assertValue(value, owner, argument)
    const parameter = view?.parameters[index]
    if (parameter && value?.kind === 'scalar') {
      const expected = types.resolve(parameter.type)
      if (!Scalars.admitsScalarType(value.type, expected)) {
        reject(owner, argument, `Expected a ${expected.name} value.`)
      }
    }
  }
}

function assertValueCaptures(injection: AST.Injection, scope: Scope, owner: ViewOwner): void {
  for (const capture of injection.captures) {
    if (AST.IsKind(capture.value, 'Name')) {
      assertValue(resolveLocal(scope, capture.value.value), owner, capture.value)
    }
  }
}

function assertValidPress(
  node: AST.PressBinding,
  view: OptionalBinding,
  scope: Scope,
  owner: ViewOwner,
): void {
  if (!supportsPress(view)) {
    reject(owner, node, 'This view does not accept on press.')
  }
  Switch.kind(node.handler, {
    Name: name => assertActionCall(name, [], scope, owner),
    InlineAction: action => assertValidActionBody(action.body, scope, owner),
  })
}

function supportsPress(binding: OptionalBinding): boolean {
  if (binding?.kind !== 'ViewDeclaration' || !AST.IsKind(binding.body, 'Block')) {
    return false
  }
  const render = AST.FindViewRenderStatement(binding.body)
  return render?.kind === 'RenderInjectStatement'
    && render.injection.captures.some(capture =>
      AST.IsKind(capture.value, 'ContextReference') && capture.value.value === 'press'
    )
}

function assertValidActionBody(body: AST.InlineActionBody, scope: Scope, owner: ViewOwner): void {
  const statements = AST.IsKind(body, 'Block') ? body.statements : [body]
  for (const statement of statements) {
    if (AST.IsKind(statement, 'SetStatement')) {
      assertStateWrite(statement, scope, owner)
    } else if (AST.IsKind(statement, 'DoStatement')) {
      assertActionCall(statement.target, statement.arguments, scope, owner)
    } else {
      // Source validation owns statement placement.
    }
  }
}

function assertStateWrite(node: AST.SetStatement, scope: Scope, owner: ViewOwner): void {
  const binding = resolve(scope, node.target.value)
  if (binding?.kind !== 'scalar' || !binding.writable) {
    reject(owner, node.target, `Cannot set ${node.target.value}: it is not writable state.`)
  }
  assertScalarType(node.value, binding.type, scope, owner)
}

function assertActionCall(
  target: AST.Name,
  values: readonly AST.Expression[],
  scope: Scope,
  owner: ViewOwner,
): void {
  const action = resolve(scope, target.value)
  if (action?.kind !== 'ActionDeclaration') {
    reject(owner, target, `${target.value} is not a visible action.`)
  }
  if (values.length !== action.parameters.length) {
    reject(owner, target, `${target.value} expects ${action.parameters.length} action arguments; got ${values.length}.`)
  }
  for (const [index, parameter] of action.parameters.entries()) {
    assertScalarType(values[index]!, scope.types.resolve(parameter.type), scope, owner)
  }
}

function assertScalarType(value: AST.Expression, target: Scalars.ScalarType, scope: Scope, owner: ViewOwner): void {
  const actual = requireScalarValue(value, scope, owner, target.name)
  if (!Scalars.admitsScalarType(actual, target)) {
    reject(owner, value, `Expected a ${target.name} value.`)
  }
}

function requireScalarValue(
  value: AST.Expression,
  scope: Scope,
  owner: ViewOwner,
  expected = 'scalar',
): Scalars.ScalarType {
  const binding = resolveExpression(scope, value)
  if (binding?.kind !== 'scalar') {
    reject(owner, value, `Expected a ${expected} value.`)
  }
  return binding.type
}

type OptionalBinding = ViewBinding | undefined

function assertValue(binding: OptionalBinding, owner: ViewOwner, value: AST.Expression): void {
  if (binding?.kind === 'ActionDeclaration') {
    reject(owner, value, 'An action can only be called with do or bound to an event.')
  }
}

function resolveExpression(scope: Scope, value: AST.Expression): OptionalBinding {
  if (AST.IsKind(value, 'GroupedExpression')) {
    return resolveExpression(scope, value.value)
  }
  if (AST.IsKind(value, 'Name')) {
    return resolve(scope, value.value)
  }
  const type = Scalars.resolveScalarExpression(value, scope.types, name => {
    const binding = resolve(scope, name.value)
    return binding?.kind === 'scalar' ? binding.type : undefined
  })
  return type && scalarBinding(type)
}

function createChildScope(parent: Scope): Scope {
  return {
    parent,
    locals: new Map(),
    resolveModule: parent.resolveModule,
    types: parent.types,
    viewTypes: parent.viewTypes,
  }
}

function declare(scope: Scope, name: AST.Name, binding: ViewBinding, owner: ViewOwner): void {
  if (scope.locals.has(name.value)) {
    UserInput.Fail(
      `View ${owner.view} in ${owner.path} declares ${name.value} more than once in one scope (offset ${name.range.start}).`,
    )
  }
  scope.locals.set(name.value, binding)
}

function resolve(scope: Scope, name: string): OptionalBinding {
  return resolveLocal(scope, name) ?? scope.resolveModule(name)
}

function resolveLocal(scope: Scope, name: string): OptionalBinding {
  for (let current: OptionalScope = scope; current; current = current.parent) {
    const binding = current.locals.get(name)
    if (binding !== undefined) {
      return binding
    }
  }
  return undefined
}

function reject(owner: ViewOwner, source: AST.Node, message: string): never {
  return UserInput.Fail(`View ${owner.view} in ${owner.path} (offset ${source.range.start}): ${message}`)
}
