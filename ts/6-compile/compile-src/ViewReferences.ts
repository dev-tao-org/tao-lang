import { NewlineCharacter } from '@shared'
import type * as Typecheck from '@typecheck'

import { emitStringLiteral, type ScopeCode } from './codegen-util'
import type { NamedValue } from './codegen-util'

/** ViewReferences collects only used imported bindings and preserves their original TypeScript symbols. */
export type ViewReferences = {
  scope: ScopeCode
  initialize(): string
}

/** createViewReferences projects imports lazily while local and ancestor bindings keep lexical lookup. */
export function createViewReferences(
  bindings: readonly Typecheck.ModuleBinding[],
  shadowed: ReadonlySet<string>,
  liveLocalAliases: boolean,
): ViewReferences {
  const imports = new Map(bindings.map(binding => [binding.name, binding]))
  const used = new Map<string, Typecheck.ModuleBinding>()
  const scope = {
    value: '_Scope',
    liveLocalAliases,
    resolveReference(name: string) {
      const binding = shadowed.has(name) ? undefined : imports.get(name)
      if (!binding) {
        return undefined
      }
      used.set(name, binding)
      return `${createProjectionName(binding)}[${emitStringLiteral(binding.target)}]`
    },
  }
  return {
    scope,
    initialize: () =>
      [...used.values()].map(binding => {
        const type = `ModuleImports[${emitStringLiteral(binding.name)}]`
        const mapping = `{ [${emitStringLiteral(binding.target)}]: ${emitStringLiteral(binding.name)} }`
        return `const ${createProjectionName(binding)} = TR.ScopeAliases<${type}>(_Scope, ${mapping});`
      }).join(NewlineCharacter),
  }
}

/** shadowReferences keeps block-local bindings from using an imported definition anchor. */
export function shadowReferences(scope: ScopeCode, definitions: readonly NamedValue[]): ScopeCode {
  if (typeof scope === 'string') {
    return scope
  }
  const names = new Set(
    definitions.map(definition => typeof definition.name === 'string' ? definition.name : definition.name.value),
  )
  return { ...scope, resolveReference: name => names.has(name) ? undefined : scope.resolveReference(name) }
}

function createProjectionName(binding: Typecheck.ModuleBinding): string {
  return `_Imported_${binding.name.replaceAll('.', '$')}`
}
