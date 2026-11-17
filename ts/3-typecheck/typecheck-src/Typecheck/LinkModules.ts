import * as AST from '@ast-gen'
import { UserInput } from '@shared'
import { orderDefinitions } from '../LinkModuleDefinitions'
import { collectReferencedNames } from '../LinkModuleValidation'
import { createModuleValueResolver } from '../ModuleValueResolution'
import { createScalarTypeScope } from '../ScalarTypes'
import { assertValidViewScopes } from '../ViewScopeValidation'
import * as Modules from './Modules'

/** linkModules resolves declarations from structurally validated sources and orders module-level initialization. */
export function linkModules(entry: string, sources: readonly Modules.SourceModule[]): Modules.LinkedProgram {
  const modules: SourceModulesByPath = new Map(sources.map(source => [source.path, source]))
  if (!modules.has(entry)) {
    UserInput.Fail(`Entry module is unavailable: ${entry}`)
  }
  const bindings: ModuleBindingsBySourcePath = new Map(
    sources.map(source => [source.path, [] as Modules.ModuleBinding[]]),
  )
  const ownNames: OwnDeclarationNamesBySourcePath = new Map(
    sources.map(source => [source.path, collectOwnDeclarationNames(source)]),
  )

  for (const source of sources) {
    const sourceBindings = bindings.get(source.path)!
    const sourceNames = ownNames.get(source.path)!
    assertUniqueOwnDeclarations(source)
    addExplicitBindings(source, modules, sourceBindings, sourceNames)
    addImplicitSiblingBindings(source, modules, sourceBindings, sourceNames, collectReferencedNames(source.document))
    assertUniqueBindings(source, sourceBindings)
  }

  const linkedModules = sources.map(source => ({
    path: source.path,
    document: source.document,
    bindings: bindings.get(source.path)!,
    scalarTypes: createScalarTypeScope(source.document, source.path),
    imports: source.imports,
    project: source.project,
  }))
  const definitions = orderDefinitions(linkedModules)
  validateScalarValues(linkedModules, definitions)
  return { entry, modules: linkedModules, definitions }
}

function validateScalarValues(
  modules: readonly Modules.LinkedModule[],
  definitions: readonly Modules.LinkedDefinition[],
): void {
  const viewTypes = new Map(
    modules.flatMap(module =>
      AST.GetViewDeclarations(module.document).map(view => [view, module.scalarTypes] as const)
    ),
  )
  const resolveModule = createModuleValueResolver(modules)
  for (const definition of definitions) {
    resolveModule(definition.source, definition.declaration.name.value)
  }
  for (const module of modules) {
    assertValidViewScopes(module.document, module.scalarTypes, name => resolveModule(module.path, name), viewTypes)
  }
}

type SourceModulesByPath = ReadonlyMap<string, Modules.SourceModule>
type ModuleBindingsBySourcePath = ReadonlyMap<string, Modules.ModuleBinding[]>
type OwnDeclarationNamesBySourcePath = ReadonlyMap<string, ReadonlySet<string>>
type ImplicitBindingCandidatesByLocalName = Map<string, Modules.ModuleBinding[]>

function collectOwnDeclarationNames(source: Modules.SourceModule): Set<string> {
  return new Set(AST.GetValueDeclarations(source.document).map(declaration => declaration.name.value))
}

function assertUniqueOwnDeclarations(source: Modules.SourceModule): void {
  const names = new Set<string>()
  for (const declaration of AST.GetValueDeclarations(source.document)) {
    const name = declaration.name.value
    if (names.has(name)) {
      UserInput.Fail(`Module ${source.path} declares ${name} more than once.`)
    }
    names.add(name)
  }
}

function addImplicitSiblingBindings(
  source: Modules.SourceModule,
  modules: SourceModulesByPath,
  bindings: Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
  references: ReadonlySet<string>,
): void {
  const candidates: ImplicitBindingCandidatesByLocalName = new Map()
  const localNames = new Set(bindings.map(binding => binding.name))
  for (const siblingPath of source.siblings) {
    const sibling = modules.get(siblingPath)
    if (!sibling || sibling.path === source.path) {
      continue
    }
    for (const declaration of AST.GetValueDeclarations(sibling.document)) {
      if (!isImplicitCandidate(declaration, ownNames, localNames)) {
        continue
      }
      const name = declaration.name.value
      const candidate = Modules.ModuleBinding(name, sibling.path, name)
      candidates.set(name, [...candidates.get(name) ?? [], candidate])
    }
  }
  for (const [name, matches] of candidates) {
    if (matches.length > 1) {
      if (references.has(name)) {
        UserInput.Fail(`Module ${source.path} has ambiguous sibling name ${name}.`)
      }
      continue
    }
    const unambiguousBinding = matches[0]!
    bindings.push(unambiguousBinding)
  }
}

function isImplicitCandidate(
  declaration: AST.ValueDeclaration,
  ownNames: ReadonlySet<string>,
  localNames: ReadonlySet<string>,
): boolean {
  return isImplicitlyVisible(declaration)
    && !ownNames.has(declaration.name.value) && !localNames.has(declaration.name.value)
}

function isImplicitlyVisible(declaration: AST.ValueDeclaration): boolean {
  return AST.GetDeclarationVisibility(declaration) === 'folder'
}

function addExplicitBindings(
  source: Modules.SourceModule,
  modules: SourceModulesByPath,
  bindings: Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
): void {
  const seenImports = new Set<string>()
  const seenStatements = new Set<string>()
  for (const resolved of source.imports) {
    const statement = resolved.statement
    const statementKey = createImportStatementKey(statement)
    if (seenStatements.has(statementKey)) {
      UserInput.Fail(`Module ${source.path} repeats an import statement.`)
    }
    seenStatements.add(statementKey)
    if (resolved.targets.length === 0) {
      const imported = statement.imports.map(item => item.target.value).join(', ')
      UserInput.Fail(`Cannot resolve ${imported} imported by ${source.path}.`)
    }
    for (const imported of statement.imports) {
      addNamedBinding(source, resolved.targets, modules, imported, bindings, ownNames, seenImports)
    }
  }
}

function createImportStatementKey(statement: AST.UseStatement): string {
  const names = statement.imports.map(createNamedImportKey).join(',')
  // ex: use ./X Foo as Bar -> ./X:Foo:Bar
  return `${statement.from?.value ?? ''}:${names}`
}

function createNamedImportKey(imported: AST.NamedImport): string {
  // ex: Foo as Bar -> Foo:Bar
  return `${imported.target.value}:${imported.alias?.value ?? ''}`
}

function addNamedBinding(
  importer: Modules.SourceModule,
  targets: Modules.SourceModule['imports'][number]['targets'],
  modules: SourceModulesByPath,
  imported: AST.NamedImport,
  bindings: Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  const targetName = imported.target.value
  const matches = targets.flatMap(target => {
    const targetModule = modules.get(target.path)
    if (!targetModule) {
      UserInput.Fail(`Imported module is unavailable: ${target.path}`)
    }
    return AST.GetValueDeclarations(targetModule.document)
      .filter(declaration => declaration.name.value === targetName && isVisible(declaration, target.relation))
      .map(declaration => ({ target, declaration }))
  })
  if (matches.length === 0) {
    const nameExists = targets.some(target => declaresValue(modules.get(target.path)!, targetName))
    const reason = nameExists ? 'is not visible' : 'does not exist'
    UserInput.Fail(`Cannot import ${targetName} from ${importer.path}: it ${reason}.`)
  }
  if (matches.length > 1) {
    UserInput.Fail(`Import ${targetName} from ${importer.path} is ambiguous.`)
  }
  const matchedTarget = matches[0]!.target
  const localName = imported.alias?.value ?? targetName
  addBinding(
    importer,
    Modules.ModuleBinding(localName, matchedTarget.path, targetName),
    bindings,
    ownNames,
    seenImports,
  )
}

function addBinding(
  importer: Modules.SourceModule,
  binding: Modules.ModuleBinding,
  bindings: Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  const identity = `${binding.name}:${binding.source}:${binding.target}`
  if (seenImports.has(identity)) {
    UserInput.Fail(`Module ${importer.path} imports ${binding.name} more than once.`)
  }
  seenImports.add(identity)
  if (ownNames.has(binding.name)) {
    UserInput.Fail(`Module ${importer.path} imports ${binding.name}, which it also declares.`)
  }
  bindings.push(binding)
}

function assertUniqueBindings(
  source: Modules.SourceModule,
  sourceBindings: readonly Modules.ModuleBinding[],
): void {
  const names = new Set<string>()
  for (const binding of sourceBindings) {
    if (names.has(binding.name)) {
      UserInput.Fail(`Module ${source.path} has more than one binding named ${binding.name}.`)
    }
    names.add(binding.name)
  }
}

function isVisible(
  declaration: AST.ValueDeclaration,
  relation: Modules.SourceModule['imports'][number]['targets'][number]['relation'],
): boolean {
  if (relation === 'same-file') {
    return true
  }
  const visibility = AST.GetDeclarationVisibility(declaration)
  return visibility === 'package' || (visibility === 'folder' && relation === 'same-directory')
}

function declaresValue(source: Modules.SourceModule, name: string): boolean {
  return AST.GetValueDeclarations(source.document).some(declaration => declaration.name.value === name)
}
