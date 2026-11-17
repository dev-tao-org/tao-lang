import * as AST from '@ast-gen'
import { UserInput } from '@shared'
import { createModuleMemberKey, type LinkedDefinition, type LinkedModule, ModuleBinding } from './Typecheck'

/** orderDefinitions sorts module-level lets by their linked value dependencies. */
export function orderDefinitions(modules: readonly LinkedModule[]): LinkedDefinition[] {
  const state = createDefinitionOrderState(modules)
  for (const item of state.definitions) {
    if (AST.IsLetDeclaration(item.declaration)) {
      visitDefinition(item, state)
    }
  }
  return state.orderedDefinitions
}

type DependencyDeclaration = AST.LetDeclaration | AST.AppDeclaration
type DependencyDefinition = { source: string; declaration: DependencyDeclaration }
type DependencyDefinitionsByModuleMemberKey = ReadonlyMap<string, DependencyDefinition>
type LinkedModulesBySourcePath = ReadonlyMap<string, LinkedModule>
type ModuleKnownNamesBySourcePath = ReadonlyMap<string, ReadonlySet<string>>
type DefinitionOrderState = {
  definitions: readonly DependencyDefinition[]
  definitionsByKey: DependencyDefinitionsByModuleMemberKey
  modulesByPath: LinkedModulesBySourcePath
  knownNamesByPath: ModuleKnownNamesBySourcePath
  orderedDefinitions: LinkedDefinition[]
  visiting: Set<string>
  visited: Set<string>
}

function createDefinitionOrderState(modules: readonly LinkedModule[]): DefinitionOrderState {
  // App roots can be dependencies of lets, but only lets belong in the emitted order.
  const definitions = collectDependencyDefinitions(modules)
  const definitionsByKey = new Map(definitions.map(item => [createDefinitionKey(item), item]))
  const modulesByPath = new Map(modules.map(module => [module.path, module]))
  const knownNamesByPath = new Map(modules.map(module => [module.path, collectModuleKnownNames(module)]))
  return {
    definitions,
    definitionsByKey,
    modulesByPath,
    knownNamesByPath,
    orderedDefinitions: [],
    visiting: new Set(),
    visited: new Set(),
  }
}

function visitDefinition(item: DependencyDefinition, state: DefinitionOrderState): void {
  const key = createDefinitionKey(item)
  if (state.visited.has(key)) {
    return
  }
  if (state.visiting.has(key)) {
    UserInput.fail(`Module-level let cycle includes ${item.declaration.name.value} in ${item.source}.`)
  }
  state.visiting.add(key)
  visitDefinitionDependencies(item, state)
  state.visiting.delete(key)
  state.visited.add(key)
  // Append after visiting dependencies, so every referenced let is initialized first.
  if (AST.IsLetDeclaration(item.declaration)) {
    state.orderedDefinitions.push({ source: item.source, declaration: item.declaration })
  }
}

function visitDefinitionDependencies(item: DependencyDefinition, state: DefinitionOrderState): void {
  const module = state.modulesByPath.get(item.source)!
  const knownNames = state.knownNamesByPath.get(item.source)!
  const dependencies = collectDefinitionDependencies(item, module, state.definitionsByKey, knownNames)
  for (const dependency of dependencies) {
    const key = createModuleMemberKey(dependency.source, dependency.target)
    const target = state.definitionsByKey.get(key)
    if (target) {
      visitDefinition(target, state)
    }
  }
}

function createDefinitionKey(item: DependencyDefinition): string {
  return createModuleMemberKey(item.source, item.declaration.name.value)
}

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
  definitions: DependencyDefinitionsByModuleMemberKey,
  knownNames: ReadonlySet<string>,
): ModuleBinding[] {
  const value = AST.IsAppDeclaration(item.declaration)
    ? AST.GetAppRoot(item.declaration)
    : item.declaration.value
  const dependencies: ModuleBinding[] = []
  AST.VisitExpressionNames(value, name => {
    dependencies.push(...resolveDefinitionDependencies(name, module, definitions, knownNames))
  })
  return dependencies
}

function resolveDefinitionDependencies(
  name: AST.Name,
  module: LinkedModule,
  definitions: DependencyDefinitionsByModuleMemberKey,
  knownNames: ReadonlySet<string>,
): ModuleBinding[] {
  if (definitions.has(createModuleMemberKey(module.path, name.value))) {
    return [ModuleBinding(name.value, module.path, name.value)]
  }
  const imports = module.bindings.filter(binding => binding.name === name.value)
  if (imports.length > 0) {
    return imports
  }
  if (!knownNames.has(name.value)) {
    UserInput.fail(`Unknown let reference ${name.value} in ${module.path}.`)
  }
  return []
}
