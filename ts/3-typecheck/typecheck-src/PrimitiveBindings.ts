import * as AST from '@ast-gen'
import { Switch } from '@shared'
import { createModuleMemberKey, type LinkedDefinition, type LinkedModule } from './Typecheck'

/** PrimitiveType identifies a primitive supported by the current value expressions. */
export type PrimitiveType = 'text' | 'boolean'

/** PrimitiveBindingScope resolves the primitive type of a visible lexical name when known. */
export type PrimitiveBindingScope = (name: string) => OptionalPrimitiveType

/** PrimitiveTypesByName maps local names to their known primitive type, including shadowing names. */
export type PrimitiveTypesByName = Map<string, OptionalPrimitiveType>

/** ModulePrimitiveScopesByPath maps each linked source path to its primitive binding scope. */
export type ModulePrimitiveScopesByPath = ReadonlyMap<string, PrimitiveBindingScope>

/** resolvePrimitiveExpressionType follows a literal or a name in its current lexical scope. */
export function resolvePrimitiveExpressionType(
  node: AST.Expression,
  resolveName: PrimitiveBindingScope,
): PrimitiveType | undefined {
  return Switch.kind(node, {
    Name: name => resolveName(name.value),
    TextLiteral: () => 'text',
    BooleanLiteral: () => 'boolean',
  })
}

/** resolvePrimitiveParameterType recognizes the implemented primitive parameter annotations. */
export function resolvePrimitiveParameterType(parameter: AST.Parameter): PrimitiveType | undefined {
  const type = parameter.type.value
  return type === 'text' || type === 'boolean' ? type : undefined
}

/** createLocalPrimitiveScope resolves local types, preserving shadowing even for an unknown type. */
export function createLocalPrimitiveScope(
  bindings: PrimitiveTypesByName,
  parent: PrimitiveBindingScope,
): PrimitiveBindingScope {
  return name => bindings.has(name) ? bindings.get(name) : parent(name)
}

/** createModulePrimitiveScopes resolves linked module values in their global initialization order. */
export function createModulePrimitiveScopes(
  modules: readonly LinkedModule[],
  definitions: readonly LinkedDefinition[],
): ModulePrimitiveScopesByPath {
  const typesByMember: PrimitiveTypesByMember = new Map()
  const scopes = new Map(modules.map(module => [module.path, createModuleScope(module, typesByMember)]))
  for (const { source, declaration } of definitions) {
    const primitiveType = resolvePrimitiveExpressionType(declaration.value, scopes.get(source)!)
    const memberKey = createModuleMemberKey(source, declaration.name.value)
    typesByMember.set(memberKey, primitiveType)
  }
  return scopes
}

type OptionalPrimitiveType = PrimitiveType | undefined
type PrimitiveTypesByMember = Map<string, OptionalPrimitiveType>

function createModuleScope(module: LinkedModule, typesByMember: PrimitiveTypesByMember): PrimitiveBindingScope {
  const imports = new Map(module.bindings.map(binding => [
    binding.name,
    createModuleMemberKey(binding.source, binding.target),
  ]))
  return name => {
    const memberKey = imports.get(name) ?? createModuleMemberKey(module.path, name)
    return typesByMember.get(memberKey)
  }
}
