import * as AST from '@ast-gen'
import { createModuleMemberKey, type LinkedModule } from './Typecheck'
import { TextBinding, type ViewBinding } from './ViewScopeValidation'

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

function resolveModuleValue(module: LinkedModule, name: string, resolve: ResolveLinkedValue): ViewBinding | undefined {
  const declaration = AST.FindValueDeclaration(module.document, name)
  if (declaration?.kind === 'ViewDeclaration') {
    return declaration
  }
  if (declaration?.kind === 'LetDeclaration') {
    const value = declaration.value
    return AST.IsKind(value, 'TextLiteral') ? TextBinding : resolve(module.path, value.value)
  }
  const binding = module.bindings.find(binding => binding.name === name)
  return binding ? resolve(binding.source, binding.target) : undefined
}
