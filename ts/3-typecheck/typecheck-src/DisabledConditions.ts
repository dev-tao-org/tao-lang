import * as AST from '@ast-gen'
import { Errors, Switch } from '@shared'
import * as PrimitiveBindings from './PrimitiveBindings'
import type { LinkedDefinition, LinkedModule } from './Typecheck'

/** assertBooleanDisabledConditions checks render conditions against linked and lexical value types. */
export function assertBooleanDisabledConditions(
  modules: readonly LinkedModule[],
  definitions: readonly LinkedDefinition[],
  modulesWithNamedConditions: ReadonlySet<string>,
): void {
  const scopes = PrimitiveBindings.createModulePrimitiveScopes(modules, definitions)
  for (const module of modules) {
    if (!modulesWithNamedConditions.has(module.path)) {
      continue
    }
    const scope = scopes.get(module.path)!
    for (const view of AST.GetViewDeclarations(module.document)) {
      assertViewConditions(module, view, scope)
    }
  }
}

function assertViewConditions(
  module: LinkedModule,
  view: AST.ViewDeclaration,
  parent: PrimitiveBindings.PrimitiveBindingScope,
): void {
  const statements = AST.GetViewDeclarationStatements(view)
  if (!statements) {
    return
  }
  const bindings: PrimitiveBindings.PrimitiveTypesByName = new Map()
  const scope = PrimitiveBindings.createLocalPrimitiveScope(bindings, parent)
  const children = AST.GetNestedViewDeclarations(statements)
  for (const parameter of view.parameters) {
    bindings.set(parameter.name.value, PrimitiveBindings.resolvePrimitiveParameterType(parameter))
  }
  for (const child of children) {
    bindings.set(child.name.value, undefined)
  }
  for (const statement of statements) {
    Switch.kind(statement, {
      LetDeclaration: definition => classifyLocalLet(definition, bindings, scope),
      RenderViewExpressionStatement: render => assertRenderConditions(module, render.expression, scope),
      RenderInjectStatement: Switch.nothing,
      ViewDeclaration: Switch.nothing,
    })
  }
  for (const child of children) {
    assertViewConditions(module, child, scope)
  }
}

function assertRenderConditions(
  module: LinkedModule,
  node: AST.ViewRenderExpression,
  parent: PrimitiveBindings.PrimitiveBindingScope,
): void {
  const condition = node.interaction?.condition
  if (condition && PrimitiveBindings.resolvePrimitiveExpressionType(condition, parent) !== 'boolean') {
    Errors.ThrowUserInput(`The disabled condition on ${node.target.value} in ${module.path} must be a boolean.`)
  }
  if (!node.block) {
    return
  }
  const bindings: PrimitiveBindings.PrimitiveTypesByName = new Map()
  const scope = PrimitiveBindings.createLocalPrimitiveScope(bindings, parent)
  for (const statement of AST.GetViewRenderBlockStatements(node)) {
    if (AST.IsLetDeclaration(statement)) {
      classifyLocalLet(statement, bindings, scope)
    } else {
      assertRenderConditions(module, statement, scope)
    }
  }
}

function classifyLocalLet(
  definition: AST.LetDeclaration,
  bindings: PrimitiveBindings.PrimitiveTypesByName,
  scope: PrimitiveBindings.PrimitiveBindingScope,
): void {
  const type = PrimitiveBindings.resolvePrimitiveExpressionType(definition.value, scope)
  bindings.set(definition.name.value, type)
}
