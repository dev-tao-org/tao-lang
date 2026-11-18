import * as AST from '@ast-gen'
import { resolveScalarExpression, type ScalarTypeScope } from './ScalarTypes'
import { createModuleMemberKey, type LinkedModule } from './Typecheck'
import { scalarBinding, type ViewBinding } from './ViewScopeValidation'

/** ModuleScalarScope pairs a linked module with its scalar types during validation. */
export type ModuleScalarScope = { module: LinkedModule; types: ScalarTypeScope }

/** createModuleValueResolver follows linked module aliases to the names needed by scoped actions. */
export function createModuleValueResolver(scopes: readonly ModuleScalarScope[]): ResolveLinkedValue {
  const scopesByPath = new Map(scopes.map(scope => [scope.module.path, scope]))
  const cache: ResolvedValuesByKey = new Map()
  return function resolve(path, name) {
    const key = createModuleMemberKey(path, name)
    const existing = cache.get(key)
    if (existing !== undefined) {
      return existing ?? undefined
    }
    const scope = scopesByPath.get(path)!
    const value = resolveModuleValue(scope, name, resolve)
    cache.set(key, value ?? null)
    return value
  }
}

type ResolveLinkedValue = (path: string, name: string) => ViewBinding | undefined
type CachedViewBinding = ViewBinding | null
type ResolvedValuesByKey = Map<string, CachedViewBinding>

function resolveModuleValue(
  { module, types }: ModuleScalarScope,
  name: string,
  resolve: ResolveLinkedValue,
): ViewBinding | undefined {
  const declaration = AST.FindValueDeclaration(module.document, name)
  if (declaration?.kind === 'ViewDeclaration') {
    return declaration
  }
  if (declaration?.kind === 'LetDeclaration') {
    return resolveLetValue(declaration.value, types, name => resolve(module.path, name))
  }
  const binding = module.bindings.find(binding => binding.name === name)
  return binding ? resolve(binding.source, binding.target) : undefined
}

function resolveLetValue(
  node: AST.Expression,
  types: ScalarTypeScope,
  resolve: (name: string) => ViewBinding | undefined,
): ViewBinding | undefined {
  if (AST.IsKind(node, 'GroupedExpression')) {
    return resolveLetValue(node.value, types, resolve)
  }
  if (AST.IsKind(node, 'Name')) {
    return resolve(node.value)
  }
  const scalar = resolveScalarExpression(node, types, name => {
    const binding = resolve(name.value)
    return binding?.kind === 'scalar' ? binding.type : undefined
  })
  return scalar && scalarBinding(scalar)
}
