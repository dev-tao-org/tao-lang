import * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import type { LinkedDefinition, LinkedModule, ModuleBinding } from './Modules'

/** orderDefinitions sorts module-level lets by their linked value dependencies. */
export function orderDefinitions(modules: readonly LinkedModule[]): LinkedDefinition[] {
  const definitions = dependencyDefinitions(modules)
  const definitionByKey = new Map(
    definitions.map(item => [definitionKey(item.source, item.declaration.name.value), item]),
  )
  const moduleByPath = new Map(modules.map(module => [module.path, module]))
  const knownNames = new Map(modules.map(module => [module.path, moduleKnownNames(module)]))
  const ordered: LinkedDefinition[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (item: DependencyDefinition): void => {
    const key = definitionKey(item.source, item.declaration.name.value)
    if (visited.has(key)) {
      return
    }
    if (visiting.has(key)) {
      Errors.ThrowUserInput(`Module-level let cycle includes ${item.declaration.name.value} in ${item.source}.`)
    }
    visiting.add(key)
    const module = moduleByPath.get(item.source)!
    const names = knownNames.get(item.source)!
    for (const dependency of dependenciesFor(item, module, definitionByKey, names)) {
      const target = definitionByKey.get(definitionKey(dependency.source, dependency.target))
      if (target) {
        visit(target)
      }
    }
    visiting.delete(key)
    visited.add(key)
    if (AST.IsLetDefinition(item.declaration)) {
      ordered.push({ source: item.source, declaration: item.declaration })
    }
  }
  for (const item of definitions) {
    if (AST.IsLetDefinition(item.declaration)) {
      visit(item)
    }
  }
  return ordered
}

type DependencyDefinition = { source: string; declaration: AST.LetDefinition | AST.AppDeclaration }

function moduleKnownNames(module: LinkedModule): Set<string> {
  const declaredNames = AST.ValueDeclarations(module.document.root).map(declaration => declaration.name.value)
  const importedNames = module.bindings.map(binding => binding.name)
  return new Set([...declaredNames, ...importedNames])
}

function dependencyDefinitions(modules: readonly LinkedModule[]): DependencyDefinition[] {
  return modules.flatMap(module =>
    module.document.root.declarations
      .filter((node): node is DependencyDefinition['declaration'] =>
        AST.IsLetDefinition(node) || AST.IsAppDeclaration(node)
      )
      .map(declaration => ({ source: module.path, declaration }))
  )
}

function dependenciesFor(
  item: DependencyDefinition,
  module: LinkedModule,
  definitions: ReadonlyMap<string, DependencyDefinition>,
  knownNames: ReadonlySet<string>,
): ModuleBinding[] {
  const value = AST.IsAppDeclaration(item.declaration) ? item.declaration.root : item.declaration.value
  if (!AST.IsKind(value, 'Name')) {
    return []
  }
  if (definitions.has(definitionKey(module.path, value.value))) {
    return [{ name: value.value, source: module.path, target: value.value }]
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

function definitionKey(source: string, name: string): string {
  return `${source}\0${name}`
}
