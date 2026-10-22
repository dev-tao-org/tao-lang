import * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import { orderDefinitions } from './LinkModuleDefinitions'
import { assertUniqueLocalBindings, collectReferencedNames } from './LinkModuleValidation'
import { deriveNamespaceFromPath, type LinkedProgram, type ModuleBinding, type SourceModule } from './Modules'

/** linkModules resolves declaration imports and orders module-level value initialization. */
export function linkModules(entry: string, sources: readonly SourceModule[]): LinkedProgram {
  const modules = new Map(sources.map(source => [source.path, source]))
  if (!modules.has(entry)) {
    Errors.ThrowUserInput(`Entry module is unavailable: ${entry}`)
  }
  const bindings = new Map(sources.map(source => [source.path, [] as ModuleBinding[]]))
  const ownNames = new Map(sources.map(source => [source.path, collectOwnDeclarationNames(source)]))

  for (const source of sources) {
    const sourceBindings = bindings.get(source.path)!
    const sourceNames = ownNames.get(source.path)!
    assertUniqueOwnDeclarations(source)
    assertUniqueLocalBindings(source)
    addExplicitBindings(source, modules, sourceBindings, sourceNames)
    addImplicitSiblingBindings(source, modules, sourceBindings, sourceNames, collectReferencedNames(source.document))
    assertUniqueBindings(source, sourceBindings, sourceNames)
  }

  const linkedModules = sources.map(source => ({
    path: source.path,
    document: source.document,
    bindings: bindings.get(source.path)!,
  }))
  return { entry, modules: linkedModules, definitions: orderDefinitions(linkedModules) }
}

function collectOwnDeclarationNames(source: SourceModule): Set<string> {
  return new Set(AST.GetValueDeclarations(source.document).map(declaration => declaration.name.value))
}

function assertUniqueOwnDeclarations(source: SourceModule): void {
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
  source: SourceModule,
  modules: ReadonlyMap<string, SourceModule>,
  bindings: ModuleBinding[],
  ownNames: ReadonlySet<string>,
  references: ReadonlySet<string>,
): void {
  const candidates = new Map<string, ModuleBinding[]>()
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
      const candidate = { name, source: sibling.path, target: name }
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
  source: SourceModule,
  modules: ReadonlyMap<string, SourceModule>,
  bindings: ModuleBinding[],
  ownNames: ReadonlySet<string>,
): void {
  const seenImports = new Set<string>()
  const seenStatements = new Set<string>()
  for (const resolved of source.imports) {
    const statement = resolved.statement
    const statementKey = importStatementKey(statement)
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
        const namespace = packageNamespace(statement)
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

function packageNamespace(statement: AST.UsePackageStatement): string {
  const namespace = statement.alias?.value ?? deriveNamespaceFromPath(statement.from.value)
  if (!namespace) {
    Errors.ThrowUserInput(`Cannot derive a namespace from package path ${statement.from.value}.`)
  }
  return namespace
}

function importStatementKey(statement: AST.UseStatement | AST.UsePackageStatement): string {
  if (AST.IsUsePackageStatement(statement)) {
    // ex: from=@Foo, alias=Bar -> package:@Foo:Bar
    return `package:${statement.from.value}:${statement.alias?.value ?? ''}`
  }
  const names = statement.imports.map(namedImportKey).join(',')
  // ex: use Foo as Bar from X -> use:Foo:Bar:X
  return `use:${statement.all ? 'all' : names}:${statement.from?.value ?? ''}`
}

function namedImportKey(imported: AST.NamedImport): string {
  // ex: Foo as Bar -> Foo:Bar
  return `${imported.target.value}:${imported.alias?.value ?? ''}`
}

function addNamedBinding(
  importer: SourceModule,
  targets: SourceModule['imports'][number]['targets'],
  modules: ReadonlyMap<string, SourceModule>,
  imported: AST.NamedImport,
  bindings: ModuleBinding[],
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
    {
      name: localName,
      source: matchedTarget.path,
      target: targetName,
    },
    bindings,
    ownNames,
    seenImports,
  )
}

function addWildcardBindings(
  importer: SourceModule,
  targetModule: SourceModule,
  targetPath: string,
  relation: SourceModule['imports'][number]['targets'][number]['relation'],
  bindings: ModuleBinding[],
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  for (const declaration of AST.GetValueDeclarations(targetModule.document)) {
    if (declaration.visibility !== 'public') {
      continue
    }
    addBinding(
      importer,
      {
        name: declaration.name.value,
        source: targetPath,
        target: declaration.name.value,
      },
      bindings,
      ownNames,
      seenImports,
      `all:${relation}`,
    )
  }
}

function addPackageBindings(
  importer: SourceModule,
  targetModule: SourceModule,
  targetPath: string,
  relation: SourceModule['imports'][number]['targets'][number]['relation'],
  namespace: string,
  bindings: ModuleBinding[],
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  for (const declaration of AST.GetValueDeclarations(targetModule.document)) {
    if (isVisible(declaration, relation)) {
      addBinding(
        importer,
        {
          name: `${namespace}.${declaration.name.value}`,
          source: targetPath,
          target: declaration.name.value,
        },
        bindings,
        ownNames,
        seenImports,
        `package:${namespace}`,
      )
    }
  }
}

function addBinding(
  importer: SourceModule,
  binding: ModuleBinding,
  bindings: ModuleBinding[],
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
  source: SourceModule,
  sourceBindings: readonly ModuleBinding[],
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
  relation: SourceModule['imports'][number]['targets'][number]['relation'],
): boolean {
  if (relation === 'same-file') {
    return true
  }
  const visibility = AST.GetDeclarationVisibility(declaration)
  return visibleRelations[visibility].includes(relation)
}

const visibleRelations: Record<
  AST.Visibility,
  readonly SourceModule['imports'][number]['targets'][number]['relation'][]
> = {
  file: [],
  folder: ['same-directory'],
  package: ['same-directory', 'same-package'],
  project: ['same-directory', 'same-package', 'same-project'],
  public: ['same-directory', 'same-package', 'same-project', 'public'],
}

function declaresValue(source: SourceModule, name: string): boolean {
  return AST.GetValueDeclarations(source.document).some(declaration => declaration.name.value === name)
}
