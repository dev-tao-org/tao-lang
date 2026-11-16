import * as AST from '@ast-gen'
import { Errors, Switch } from '@shared'
import { createModuleMemberKey } from './Typecheck'
import type { LinkedDefinition, LinkedModule } from './Typecheck'

/** assertBooleanDisabledConditions checks render conditions against linked and lexical value types. */
export function assertBooleanDisabledConditions(
  modules: readonly LinkedModule[],
  definitions: readonly LinkedDefinition[],
  modulesWithNamedConditions: ReadonlySet<string>,
): void {
  const definitionsByMember: BooleanDefinitionsByMember = new Map()
  const importsByPath = new Map(modules.map(module => [module.path, createImportedMembers(module)]))
  for (const definition of definitions) {
    const imports = importsByPath.get(definition.source)!
    const scope = createModuleScope(definition.source, imports, definitionsByMember)
    const key = createModuleMemberKey(definition.source, definition.declaration.name.value)
    definitionsByMember.set(key, isBooleanExpression(definition.declaration.value, scope))
  }
  for (const module of modules) {
    if (!modulesWithNamedConditions.has(module.path)) {
      continue
    }
    const imports = importsByPath.get(module.path)!
    const scope = createModuleScope(module.path, imports, definitionsByMember)
    for (const view of AST.GetViewDeclarations(module.document)) {
      assertViewConditions(module, view, scope)
    }
  }
}

type BooleanDefinitionsByMember = Map<string, boolean>
type BooleanBindingsByLocalName = Map<string, boolean>
type ImportedMembersByLocalName = ReadonlyMap<string, string>
type BooleanScope = (name: string) => boolean

function createImportedMembers(module: LinkedModule): ImportedMembersByLocalName {
  return new Map(module.bindings.map(binding => [
    binding.name,
    createModuleMemberKey(binding.source, binding.target),
  ]))
}

function createModuleScope(
  path: string,
  imports: ImportedMembersByLocalName,
  definitions: BooleanDefinitionsByMember,
): BooleanScope {
  return name => {
    const key = imports.get(name) ?? createModuleMemberKey(path, name)
    return definitions.get(key) === true
  }
}

function assertViewConditions(module: LinkedModule, view: AST.ViewDeclaration, parent: BooleanScope): void {
  const statements = AST.GetViewDeclarationStatements(view)
  if (!statements) {
    return
  }
  const bindings: BooleanBindingsByLocalName = new Map()
  const scope = createLocalScope(bindings, parent)
  const children = AST.GetNestedViewDeclarations(statements)
  for (const parameter of view.parameters) {
    bindings.set(parameter.name.value, parameter.type.value === 'boolean')
  }
  for (const child of children) {
    bindings.set(child.name.value, false)
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

function assertRenderConditions(module: LinkedModule, node: AST.ViewRenderExpression, parent: BooleanScope): void {
  const condition = node.interaction?.condition
  if (condition && !isBooleanExpression(condition, parent)) {
    Errors.ThrowUserInput(`The disabled condition on ${node.target.value} in ${module.path} must be a boolean.`)
  }
  if (!node.block) {
    return
  }
  const bindings: BooleanBindingsByLocalName = new Map()
  const scope = createLocalScope(bindings, parent)
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
  bindings: BooleanBindingsByLocalName,
  scope: BooleanScope,
): void {
  const isBoolean = isBooleanExpression(definition.value, scope)
  bindings.set(definition.name.value, isBoolean)
}

function createLocalScope(bindings: BooleanBindingsByLocalName, parent: BooleanScope): BooleanScope {
  return name => bindings.get(name) ?? parent(name)
}

function isBooleanExpression(node: AST.Expression, scope: BooleanScope): boolean {
  return AST.IsKind(node, 'BooleanLiteral') || AST.IsKind(node, 'Name') && scope(node.value)
}
