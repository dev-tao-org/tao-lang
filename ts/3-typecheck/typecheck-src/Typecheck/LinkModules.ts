import * as AST from '@ast-gen'
import { Errors, Switch } from '@shared'
import { orderDefinitions } from '../LinkModuleDefinitions'
import { collectReferencedNames } from '../LinkModuleValidation'
import { createModuleValueResolver } from '../ModuleValueResolution'
import { assertValidViewScopes } from '../ViewScopeValidation'
import * as Modules from './Modules'

/** linkModules resolves declarations from structurally validated sources and orders module-level initialization. */
export function linkModules(entry: string, sources: readonly Modules.SourceModule[]): Modules.LinkedProgram {
  const modules: SourceModulesByPath = new Map(sources.map(source => [source.path, source]))
  if (!modules.has(entry)) {
    Errors.ThrowUserInput(`Entry module is unavailable: ${entry}`)
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
    assertUniqueBindings(source, sourceBindings, sourceNames)
  }

  const linkedModules = sources.map(source => ({
    path: source.path,
    document: source.document,
    bindings: bindings.get(source.path)!,
    imports: source.imports,
    project: source.project,
  }))
  const definitions = orderDefinitions(linkedModules)
  const resolveModule = createModuleValueResolver(linkedModules)
  for (const module of linkedModules) {
    assertValidViewScopes(module.document, module.path, name => resolveModule(module.path, name))
  }
  return { entry, modules: linkedModules, definitions }
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
      Errors.ThrowUserInput(`Module ${source.path} declares ${name} more than once.`)
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
        Errors.ThrowUserInput(`Module ${source.path} has ambiguous sibling name ${name}.`)
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
      Errors.ThrowUserInput(`Module ${source.path} repeats an import statement.`)
    }
    seenStatements.add(statementKey)
    if (AST.IsUseStatement(statement) && !statement.all) {
      if (resolved.targets.length === 0) {
        const imported = statement.imports.map(item => item.target.value).join(', ')
        Errors.ThrowUserInput(`Cannot resolve ${imported} imported by ${source.path}.`)
      }
      for (const imported of statement.imports) {
        addNamedBinding(source, resolved.targets, modules, imported, bindings, ownNames, seenImports)
      }
      continue
    }
    for (const target of resolved.targets) {
      const targetModule = modules.get(target.path)
      if (!targetModule) {
        Errors.ThrowUserInput(`Imported module is unavailable: ${target.path}`)
      }
      if (AST.IsUsePackageStatement(statement)) {
        const namespace = resolvePackageNamespace(statement)
        addPackageBindings(
          source,
          targetModule,
          target.path,
          target.relation,
          namespace,
          bindings,
          ownNames,
          seenImports,
        )
      } else if (statement.all) {
        addWildcardBindings(source, targetModule, target.path, target.relation, bindings, ownNames, seenImports)
      } else {
        Errors.ThrowShouldNeverHappen('Named imports must be handled before whole-module imports.')
      }
    }
  }
}

function resolvePackageNamespace(statement: AST.UsePackageStatement): string {
  const namespace = statement.alias?.value ?? Modules.deriveNamespaceFromPath(statement.from.value)
  if (!namespace) {
    Errors.ThrowUserInput(`Cannot derive a namespace from package path ${statement.from.value}.`)
  }
  return namespace
}

function createImportStatementKey(statement: Modules.ImportStatement): string {
  return Switch.kind(statement, {
    UsePackageStatement(packageImport) {
      // ex: from=@Foo, alias=Bar -> package:@Foo:Bar
      return `package:${packageImport.from.value}:${packageImport.alias?.value ?? ''}`
    },
    UseStatement(namedImport) {
      const names = namedImport.imports.map(createNamedImportKey).join(',')
      // ex: use ./X Foo as Bar -> use:Foo:Bar:./X
      return `use:${namedImport.all ? 'all' : names}:${namedImport.from?.value ?? ''}`
    },
  })
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
      Errors.ThrowUserInput(`Imported module is unavailable: ${target.path}`)
    }
    return AST.GetValueDeclarations(targetModule.document)
      .filter(declaration => declaration.name.value === targetName && isVisible(declaration, target.relation))
      .map(declaration => ({ target, declaration }))
  })
  if (matches.length === 0) {
    const nameExists = targets.some(target => declaresValue(modules.get(target.path)!, targetName))
    const reason = nameExists ? 'is not visible' : 'does not exist'
    Errors.ThrowUserInput(`Cannot import ${targetName} from ${importer.path}: it ${reason}.`)
  }
  if (matches.length > 1) {
    Errors.ThrowUserInput(`Import ${targetName} from ${importer.path} is ambiguous.`)
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

function addWildcardBindings(
  importer: Modules.SourceModule,
  targetModule: Modules.SourceModule,
  targetPath: string,
  relation: Modules.SourceModule['imports'][number]['targets'][number]['relation'],
  bindings: Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  for (const declaration of AST.GetValueDeclarations(targetModule.document)) {
    if (declaration.visibility !== 'public') {
      continue
    }
    addBinding(
      importer,
      Modules.ModuleBinding(declaration.name.value, targetPath, declaration.name.value),
      bindings,
      ownNames,
      seenImports,
      `all:${relation}`,
    )
  }
}

function addPackageBindings(
  importer: Modules.SourceModule,
  targetModule: Modules.SourceModule,
  targetPath: string,
  relation: Modules.SourceModule['imports'][number]['targets'][number]['relation'],
  namespace: string,
  bindings: Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  for (const declaration of AST.GetValueDeclarations(targetModule.document)) {
    if (isVisible(declaration, relation)) {
      addBinding(
        importer,
        Modules.ModuleBinding(`${namespace}.${declaration.name.value}`, targetPath, declaration.name.value),
        bindings,
        ownNames,
        seenImports,
        `package:${namespace}`,
      )
    }
  }
}

function addBinding(
  importer: Modules.SourceModule,
  binding: Modules.ModuleBinding,
  bindings: Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
  kind = 'named',
): void {
  const identity = `${kind}:${binding.name}:${binding.source}:${binding.target}`
  if (seenImports.has(identity)) {
    Errors.ThrowUserInput(`Module ${importer.path} imports ${binding.name} more than once.`)
  }
  seenImports.add(identity)
  if (ownNames.has(binding.name)) {
    Errors.ThrowUserInput(`Module ${importer.path} imports ${binding.name}, which it also declares.`)
  }
  bindings.push(binding)
}

function assertUniqueBindings(
  source: Modules.SourceModule,
  sourceBindings: readonly Modules.ModuleBinding[],
  ownNames: ReadonlySet<string>,
): void {
  const names = new Set<string>()
  for (const binding of sourceBindings) {
    if (names.has(binding.name)) {
      Errors.ThrowUserInput(`Module ${source.path} has more than one binding named ${binding.name}.`)
    }
    names.add(binding.name)
  }
  for (const binding of sourceBindings) {
    const namespace = binding.name.split('.')[0]!
    if (binding.name.includes('.') && (names.has(namespace) || ownNames.has(namespace))) {
      Errors.ThrowUserInput(`Module ${source.path} has a value and namespace both named ${namespace}.`)
    }
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
  return visibleRelations[visibility].includes(relation)
}

const visibleRelations: Record<
  AST.Visibility,
  readonly Modules.SourceModule['imports'][number]['targets'][number]['relation'][]
> = {
  file: [],
  folder: ['same-directory'],
  package: ['same-directory', 'same-package'],
  project: ['same-directory', 'same-package', 'same-project'],
  public: ['same-directory', 'same-package', 'same-project', 'public'],
}

function declaresValue(source: Modules.SourceModule, name: string): boolean {
  return AST.GetValueDeclarations(source.document).some(declaration => declaration.name.value === name)
}
