import * as Typecheck from '@typecheck'
import { type PrimitiveBindings, type PrimitiveType, projectExpressionType } from './ValuesCompiler'

/** ModulePrimitiveBindingsBySourcePath maps authored module paths to their primitive-valued declarations. */
export type ModulePrimitiveBindingsBySourcePath = ReadonlyMap<string, PrimitiveBindings>

/** buildModulePrimitiveBindings classifies linked values once in their global initialization order. */
export function buildModulePrimitiveBindings(program: Typecheck.LinkedProgram): ModulePrimitiveBindingsBySourcePath {
  const bindings = new Map(
    program.modules.map(module => [module.path, new Map(module.bindings.map(binding => [binding.name, binding]))]),
  )
  const declarations = new Map<string, PrimitiveType>()
  const ownNames = new Map(program.modules.map(module => [module.path, new Map<string, PrimitiveType>()]))
  for (const definition of program.definitions) {
    const type = projectExpressionType(definition.declaration.value, name => {
      const binding = bindings.get(definition.source)?.get(name.value)
      return declarations.get(
        Typecheck.createModuleMemberKey(binding?.source ?? definition.source, binding?.target ?? name.value),
      )
    })
    if (type) {
      declarations.set(Typecheck.createModuleMemberKey(definition.source, definition.declaration.name.value), type)
      ownNames.get(definition.source)?.set(definition.declaration.name.value, type)
    }
  }
  return new Map(
    program.modules.map(module => [module.path, collectInheritedPrimitives(module, ownNames, declarations)]),
  )
}

type PrimitiveTypesByModuleMemberKey = ReadonlyMap<string, PrimitiveType>

function collectInheritedPrimitives(
  module: Typecheck.LinkedModule,
  ownNames: ModulePrimitiveBindingsBySourcePath,
  declarations: PrimitiveTypesByModuleMemberKey,
): PrimitiveBindings {
  const names = new Map(ownNames.get(module.path))
  for (const binding of module.bindings) {
    const type = declarations.get(Typecheck.createModuleMemberKey(binding.source, binding.target))
    if (type) {
      names.set(binding.name, type)
    }
  }
  return names
}
