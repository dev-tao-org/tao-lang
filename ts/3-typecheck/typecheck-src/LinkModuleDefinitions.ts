import * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import { createModuleMemberKey, type LinkedDefinition, type LinkedModule, ModuleBinding } from './Modules'

/** orderDefinitions sorts module-level lets by their linked value dependencies. */
export function orderDefinitions(modules: readonly LinkedModule[]): LinkedDefinition[] {
  const definitions = collectDependencyDefinitions(modules)
  const definitionByKey = new Map(
    definitions.map(item => [createModuleMemberKey(item.source, item.declaration.name.value), item]),
  )
  const moduleByPath = new Map(modules.map(module => [module.path, module]))
  const knownNames = new Map(modules.map(module => [module.path, collectModuleKnownNames(module)]))
  const ordered: LinkedDefinition[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (item: DependencyDefinition): void => {
    const key = createModuleMemberKey(item.source, item.declaration.name.value)
    if (visited.has(key)) {
      return
    }
    if (visiting.has(key)) {
      Errors.ThrowUserInput(`Module-level let cycle includes ${item.declaration.name.value} in ${item.source}.`)
    }
    visiting.add(key)
    const module = moduleByPath.get(item.source)!
    const names = knownNames.get(item.source)!
    for (const dependency of collectDefinitionDependencies(item, module, definitionByKey, names)) {
      const target = definitionByKey.get(createModuleMemberKey(dependency.source, dependency.target))
      if (target) {
        visit(target)
      }
    }
    visiting.delete(key)
    visited.add(key)
    if (AST.IsLetDeclaration(item.declaration)) {
      ordered.push({ source: item.source, declaration: item.declaration })
    }
  }
  for (const item of definitions) {
    if (AST.IsLetDeclaration(item.declaration)) {
      visit(item)
    }
  }
  return ordered
}

type DependencyDefinition = { source: string; declaration: AST.LetDeclaration | AST.AppDeclaration }

function collectModuleKnownNames(module: LinkedModule): Set<string> {
  const declaredNames = AST.GetValueDeclarations(module.document).map(declaration => declaration.name.value)
  const importedNames = module.bindings.map(binding => binding.name)
  return new Set([...declaredNames, ...importedNames])
}

function collectDependencyDefinitions(modules: readonly LinkedModule[]): DependencyDefinition[] {
  return modules.flatMap(module =>
    AST.GetValueDeclarations(module.document)
      .filter((node): node is DependencyDefinition['declaration'] =>
        AST.IsLetDeclaration(node) || AST.IsAppDeclaration(node)
      )
      .map(declaration => ({ source: module.path, declaration }))
  )
}

function collectDefinitionDependencies(
  item: DependencyDefinition,
  module: LinkedModule,
  definitions: ReadonlyMap<string, DependencyDefinition>,
  knownNames: ReadonlySet<string>,
): ModuleBinding[] {
  const value = AST.IsAppDeclaration(item.declaration)
    ? AST.GetAppRoot(item.declaration)
    : item.declaration.value
  if (!AST.IsKind(value, 'Name')) {
    return []
  }
  if (definitions.has(createModuleMemberKey(module.path, value.value))) {
    return [ModuleBinding(value.value, module.path, value.value)]
  }
  const imports = module.bindings.filter(binding => binding.name === value.value)
  if (imports.length > 0) {
    return imports
  }
  if (!knownNames.has(value.value)) {
    Errors.ThrowUserInput(`Unknown let reference ${value.value} in ${item.source}.`)
  }
  return []
}
