import * as Typecheck from '@typecheck'
import { isTextExpression } from './ValuesCompiler'

/** ModuleTextBindingsBySourcePath maps authored module paths to their text-valued declarations. */
export type ModuleTextBindingsBySourcePath = ReadonlyMap<string, ReadonlySet<string>>

/** buildModuleTextBindings classifies linked values once in their global initialization order. */
export function buildModuleTextBindings(program: Typecheck.LinkedProgram): ModuleTextBindingsBySourcePath {
  const bindings = new Map(
    program.modules.map(module => [module.path, new Map(module.bindings.map(binding => [binding.name, binding]))]),
  )
  const declarations = new Map<string, boolean>()
  const ownNames = new Map(program.modules.map(module => [module.path, new Set<string>()]))
  for (const definition of program.definitions) {
    const isText = isTextExpression(definition.declaration.value, name => {
      const binding = bindings.get(definition.source)?.get(name.value)
      return declarations.get(
        Typecheck.createModuleMemberKey(binding?.source ?? definition.source, binding?.target ?? name.value),
      )
        === true
    })
    declarations.set(Typecheck.createModuleMemberKey(definition.source, definition.declaration.name.value), isText)
    if (isText) {
      ownNames.get(definition.source)?.add(definition.declaration.name.value)
    }
  }
  return new Map(
    program.modules.map(module => [module.path, collectInheritedTextNames(module, ownNames, declarations)]),
  )
}

type TextClassificationsByModuleMemberKey = ReadonlyMap<string, boolean>

function collectInheritedTextNames(
  module: Typecheck.LinkedModule,
  ownNames: ModuleTextBindingsBySourcePath,
  declarations: TextClassificationsByModuleMemberKey,
): Set<string> {
  const names = new Set(ownNames.get(module.path))
  for (const binding of module.bindings) {
    if (declarations.get(Typecheck.createModuleMemberKey(binding.source, binding.target))) {
      names.add(binding.name)
    }
  }
  return names
}
