import * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import { orderDefinitions } from './LinkModuleDefinitions'
import type { LinkedProgram, ModuleBinding, SourceModule } from './Modules'

/** linkModules resolves declaration imports and orders module-level value initialization. */
export function linkModules(entry: string, sources: readonly SourceModule[]): LinkedProgram {
  const modules = new Map(sources.map(source => [source.path, source]))
  if (!modules.has(entry)) {
    Errors.ThrowUserInput(`Entry module is unavailable: ${entry}`)
  }
  const bindings = new Map(sources.map(source => [source.path, [] as ModuleBinding[]]))
  const ownNames = new Map(sources.map(source => [source.path, ownDeclarationNames(source)]))

  for (const source of sources) {
    assertUniqueOwnDeclarations(source)
    addExplicitBindings(source, modules, bindings, ownNames.get(source.path)!)
    addImplicitSiblingBindings(source, modules, bindings, ownNames.get(source.path)!)
    assertUniqueBindings(source, bindings.get(source.path)!, ownNames.get(source.path)!)
  }

  const linkedModules = sources.map(source => ({
    path: source.path,
    document: source.document,
    bindings: bindings.get(source.path)!,
  }))
  return { entry, modules: linkedModules, definitions: orderDefinitions(linkedModules) }
}

function ownDeclarationNames(source: SourceModule): Set<string> {
  return new Set(
    source.document.root.declarations
      .filter(AST.IsValueDeclaration)
      .map(declaration => declaration.name.value),
  )
}

function assertUniqueOwnDeclarations(source: SourceModule): void {
  const names = new Set<string>()
  for (const declaration of source.document.root.declarations.filter(AST.IsValueDeclaration)) {
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
  bindings: Map<string, ModuleBinding[]>,
  ownNames: ReadonlySet<string>,
): void {
  const candidates = new Map<string, ModuleBinding[]>()
  const localNames = new Set(bindings.get(source.path)!.map(binding => binding.name))
  for (const siblingPath of source.siblings) {
    const sibling = modules.get(siblingPath)
    if (!sibling || sibling.path === source.path) {
      continue
    }
    for (const declaration of sibling.document.root.declarations.filter(AST.IsValueDeclaration)) {
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
      Errors.ThrowUserInput(`Module ${source.path} has ambiguous sibling name ${name}.`)
    }
    bindings.get(source.path)!.push(matches[0]!)
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
  return declaration.visibility === 'folder'
    || (AST.IsAppDeclaration(declaration) && declaration.visibility === undefined)
}

function addExplicitBindings(
  source: SourceModule,
  modules: ReadonlyMap<string, SourceModule>,
  bindings: Map<string, ModuleBinding[]>,
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
        const namespace = statement.alias?.value ?? namespaceFromPath(statement.from.value)
        if (!namespace) {
          Errors.ThrowUserInput(`Cannot derive a namespace from package path ${statement.from.value}.`)
        }
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
      }
    }
  }
}

function importStatementKey(statement: AST.UseStatement | AST.UsePackageStatement): string {
  if (AST.IsUsePackageStatement(statement)) {
    return `package:${statement.from.value}:${statement.alias?.value ?? ''}`
  }
  const names = statement.imports.map(item => `${item.target.value}:${item.alias?.value ?? ''}`).join(',')
  return `use:${statement.all ? 'all' : names}:${statement.from?.value ?? ''}`
}

function addNamedBinding(
  importer: SourceModule,
  targets: SourceModule['imports'][number]['targets'],
  modules: ReadonlyMap<string, SourceModule>,
  imported: AST.NamedImport,
  bindings: Map<string, ModuleBinding[]>,
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  const targetName = imported.target.value
  const matches = targets.flatMap(target => {
    const targetModule = modules.get(target.path)
    if (!targetModule) {
      Errors.ThrowUserInput(`Imported module is unavailable: ${target.path}`)
    }
    return targetModule.document.root.declarations
      .filter(AST.IsValueDeclaration)
      .filter(declaration => declaration.name.value === targetName && isVisible(declaration, target.relation))
      .map(declaration => ({ target, declaration }))
  })
  const invisible = targets.some(target =>
    modules.get(target.path)!.document.root.declarations.some(declaration =>
      AST.IsValueDeclaration(declaration) && declaration.name.value === targetName
    )
  )
  if (matches.length === 0) {
    const reason = invisible ? 'is not visible' : 'does not exist'
    Errors.ThrowUserInput(`Cannot import ${targetName} from ${importer.path}: it ${reason}.`)
  }
  if (matches.length > 1) {
    Errors.ThrowUserInput(`Import ${targetName} from ${importer.path} is ambiguous.`)
  }
  const localName = imported.alias?.value ?? targetName
  addBinding(
    importer,
    {
      name: localName,
      source: matches[0]!.target.path,
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
  bindings: Map<string, ModuleBinding[]>,
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  for (const declaration of targetModule.document.root.declarations.filter(AST.IsValueDeclaration)) {
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
  bindings: Map<string, ModuleBinding[]>,
  ownNames: ReadonlySet<string>,
  seenImports: Set<string>,
): void {
  for (const declaration of targetModule.document.root.declarations.filter(AST.IsValueDeclaration)) {
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
  bindings: Map<string, ModuleBinding[]>,
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
  bindings.get(importer.path)!.push(binding)
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
  const visibility = declaration.visibility ?? (AST.IsAppDeclaration(declaration) ? 'folder' : 'file')
  if (relation === 'public') {
    return visibility === 'public'
  }
  if (visibility === 'folder') {
    return relation === 'same-directory'
  }
  if (visibility === 'package') {
    return relation === 'same-directory' || relation === 'same-package'
  }
  if (visibility === 'project') {
    return relation === 'same-directory' || relation === 'same-package' || relation === 'same-project'
  }
  return visibility === 'public'
}

function namespaceFromPath(path: string): string | undefined {
  const parts = path.split('/').filter(part => part !== '' && part !== '.' && part !== '..')
  const last = parts.at(-1)?.replace(/\.tao$/, '')
  const name = last?.startsWith('@') ? last.slice(1) : last
  return name && /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(name) ? name : undefined
}
