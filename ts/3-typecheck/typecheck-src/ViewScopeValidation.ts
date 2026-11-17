import * as AST from '@ast-gen'
import { Switch, UserInput } from '@shared'

/** ViewBinding describes a declaration visible in a view's lexical scope. */
export type ViewBinding = AST.ViewDeclaration | AST.ActionDeclaration | ValueBinding

/** ResolveModuleValue looks up a resolved declaration or text value in the view's module. */
export type ResolveModuleValue = (name: string) => ViewBinding | undefined

/** assertValidViewScopes validates local declarations, text writes, action calls and event targets. */
export function assertValidViewScopes(document: AST.Document, path: string, resolveModule: ResolveModuleValue): void {
  const scope = createScope(undefined, resolveModule)
  for (const definition of AST.GetValueDeclarations(document)) {
    if (AST.IsKind(definition, 'LetDeclaration') && AST.IsKind(definition.value, 'InterpolatedText')) {
      assertTextParts(definition.value, scope, { view: definition.name.value, path })
    }
  }
  for (const view of AST.GetViewDeclarations(document)) {
    assertValidView(view, scope, path)
  }
}

type ValueBinding = { kind: ValueBindingKind }
type ValueBindingKind = 'text' | 'state' | 'other'

/** TextBinding describes a read-only lexical text value. */
export const TextBinding: ValueBinding = { kind: 'text' }

type OptionalScope = Scope | undefined
type Scope = { parent: OptionalScope; locals: Map<string, ViewBinding>; resolveModule: ResolveModuleValue }
type ViewOwner = { view: string; path: string }

const StateBinding: ValueBinding = { kind: 'state' }
const OtherBinding: ValueBinding = { kind: 'other' }
const TextType = 'text'

function assertValidView(node: AST.ViewDeclaration, parent: Scope, path: string): void {
  const owner = { view: node.name.value, path }
  const statements = AST.GetViewDeclarationStatements(node) ?? []
  const scope = createScope(parent, parent.resolveModule)
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
    const actionScope = createScope(scope, scope.resolveModule)
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
      for (const parameter of statement.parameters) {
        assertTextType(parameter.type, owner)
      }
    }
  }
  return actions
}

function declareLet(node: AST.LetDeclaration, scope: Scope, owner: ViewOwner): void {
  const value = resolveExpression(scope, node.value, owner)
  assertValue(value, owner, node.value)
  const binding = value?.kind === 'state' ? TextBinding : value ?? OtherBinding
  declare(scope, node.name, binding, owner)
}

function declareState(node: AST.StateDeclaration, scope: Scope, owner: ViewOwner): void {
  if (node.type) {
    assertTextType(node.type, owner)
  }
  assertTextValue(node.value, scope, owner)
  declare(scope, node.name, StateBinding, owner)
}

function declareParameters(parameters: readonly AST.Parameter[], scope: Scope, owner: ViewOwner): void {
  for (const parameter of parameters) {
    const binding = parameter.type.value === TextType ? TextBinding : OtherBinding
    declare(scope, parameter.name, binding, owner)
  }
}

function assertValidRender(node: AST.ViewRenderExpression, scope: Scope, owner: ViewOwner): void {
  assertRenderTarget(node.target, scope, owner)
  for (const argument of node.arguments) {
    if (AST.IsKind(argument, 'Name')) {
      assertValue(resolveLocal(scope, argument.value), owner, argument)
    } else if (AST.IsKind(argument, 'InterpolatedText')) {
      assertTextParts(argument, scope, owner)
    } else {
      // Literal text does not reference lexical values.
    }
  }
  const statements = AST.GetViewRenderBlockStatements(node)
  if (statements.length === 0) {
    return
  }
  const children = createScope(scope, scope.resolveModule)
  for (const statement of statements) {
    Switch.kind(statement, {
      LetDeclaration: definition => declareLet(definition, children, owner),
      PressBinding: binding => assertValidPress(binding, resolve(scope, node.target.value), children, owner),
      ViewRenderExpression: expression => assertValidRender(expression, children, owner),
    })
  }
}

function assertRenderTarget(target: AST.Name, scope: Scope, owner: ViewOwner): void {
  const binding = resolveLocal(scope, target.value)
  if (binding?.kind === 'text' || binding?.kind === 'state') {
    reject(owner, target, `${target.value} is text and cannot be rendered as a view.`)
  }
  assertValue(binding, owner, target)
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
      assertStateTarget(statement, scope, owner)
      assertTextValue(statement.value, scope, owner)
    } else if (AST.IsKind(statement, 'DoStatement')) {
      assertActionCall(statement.target, statement.arguments, scope, owner)
    } else {
      // Source validation owns statement placement.
    }
  }
}

function assertStateTarget(node: AST.SetStatement, scope: Scope, owner: ViewOwner): void {
  if (resolve(scope, node.target.value)?.kind !== 'state') {
    reject(owner, node.target, `Cannot set ${node.target.value}: it is not writable state.`)
  }
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
  for (const value of values) {
    assertTextValue(value, scope, owner)
  }
}

function assertTextType(type: AST.Name, owner: ViewOwner): void {
  if (type.value !== TextType) {
    reject(owner, type, 'Only text is supported for local state and action parameters.')
  }
}

function assertTextValue(value: AST.Expression, scope: Scope, owner: ViewOwner): void {
  const binding = resolveExpression(scope, value, owner)
  if (binding?.kind !== 'text' && binding?.kind !== 'state') {
    reject(owner, value, 'Expected a text value.')
  }
}

type OptionalBinding = ViewBinding | undefined

function assertValue(binding: OptionalBinding, owner: ViewOwner, value: AST.Expression): void {
  if (binding?.kind === 'ActionDeclaration') {
    reject(owner, value, 'An action can only be called with do or bound to an event.')
  }
}

function resolveExpression(scope: Scope, value: AST.Expression, owner: ViewOwner): OptionalBinding {
  if (AST.IsKind(value, 'Name')) {
    return resolve(scope, value.value)
  }
  if (AST.IsKind(value, 'InterpolatedText')) {
    assertTextParts(value, scope, owner)
  }
  return TextBinding
}

function assertTextParts(value: AST.InterpolatedText, scope: Scope, owner: ViewOwner): void {
  for (const part of value.parts) {
    if (AST.IsKind(part, 'TextInterpolation')) {
      assertTextValue(part.value, scope, owner)
    }
  }
}

function createScope(parent: OptionalScope, resolveModule: ResolveModuleValue): Scope {
  return { parent, locals: new Map(), resolveModule }
}

function declare(scope: Scope, name: AST.Name, binding: ViewBinding, owner: ViewOwner): void {
  if (scope.locals.has(name.value)) {
    UserInput.fail(
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
  return UserInput.fail(`View ${owner.view} in ${owner.path} (offset ${source.range.start}): ${message}`)
}
