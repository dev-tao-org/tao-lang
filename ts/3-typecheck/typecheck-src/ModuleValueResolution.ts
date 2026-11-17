import * as AST from '@ast-gen'
import { resolveScalarExpression, type ScalarTypeScope } from './ScalarTypes'
import { createModuleMemberKey, type LinkedModule } from './Typecheck'
import { scalarBinding, type ViewBinding } from './ViewScopeValidation'

/** createModuleValueResolver follows linked module aliases to the names needed by scoped actions. */
export function createModuleValueResolver(modules: readonly LinkedModule[]): ResolveLinkedValue {
  const modulesByPath = new Map(modules.map(module => [module.path, module]))
  const cache: ResolvedValuesByKey = new Map()
  return function resolve(path, name) {
    const key = createModuleMemberKey(path, name)
    const existing = cache.get(key)
    if (existing !== undefined) {
      return existing ?? undefined
    }
    const module = modulesByPath.get(path)!
    const value = resolveModuleValue(module, name, resolve)
    cache.set(key, value ?? null)
    return value
  }
}

type ResolveLinkedValue = (path: string, name: string) => ViewBinding | undefined
type CachedViewBinding = ViewBinding | null
type ResolvedValuesByKey = Map<string, CachedViewBinding>

function resolveModuleValue(
  module: LinkedModule,
  name: string,
  resolve: ResolveLinkedValue,
): ViewBinding | undefined {
  const declaration = AST.FindValueDeclaration(module.document, name)
  if (declaration?.kind === 'ViewDeclaration') {
    return declaration
  }
  if (declaration?.kind === 'LetDeclaration') {
    return resolveLetValue(declaration.value, module.scalarTypes, name => resolve(module.path, name))
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
