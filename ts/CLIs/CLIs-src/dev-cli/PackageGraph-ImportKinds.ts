import { Sort } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import type { DependencyCruiser } from '../cli-kit/bridges/Bridge_dependency-cruiser'

/** ImportKind distinguishes emitted dependencies, explicit type declarations and other erased imports. */
export type ImportKind = 'value' | 'type' | 'compile-only'

type ClassifiedImport = { dependency: DependencyCruiser.IDependency; kind: ImportKind }
type TypeImportSyntax = { mixedDefaults: ReadonlySet<string>; explicitTypes: ReadonlySet<string> }

/** classifyModuleImports preserves separate explicit type edges when fixing mixed imports. */
export function classifyModuleImports(workspace: string, module: DependencyCruiser.IModule): ClassifiedImport[] {
  const dependencies = module.dependencies.toSorted(Sort.By(dependency => dependency.module, Sort.CompareStrings))
  const syntax = dependencies.some(isReportedTypeImport)
    ? readTypeImportSyntax(Path.join(workspace, module.source))
    : undefined
  return dependencies.flatMap(dependency =>
    resolveImportKinds(dependency, dependencies, syntax).map(kind => ({ dependency, kind }))
  )
}

function readTypeImportSyntax(filename: string): TypeImportSyntax {
  const source = TypeScript.createSourceFile(
    filename,
    FS.readFileSync(filename, 'utf8'),
    TypeScript.ScriptTarget.Latest,
  )
  const mixedDefaults = new Set<string>()
  const explicitTypes = new Set<string>()
  function visit(node: TypeScript.Node): void {
    if (TypeScript.isImportDeclaration(node) && TypeScript.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause
      if (clause?.isTypeOnly) {
        explicitTypes.add(node.moduleSpecifier.text)
      } else if (hasOnlyNamedTypeSpecifiers(clause?.namedBindings)) {
        const target = clause?.name ? mixedDefaults : explicitTypes
        target.add(node.moduleSpecifier.text)
      } else {
        // Other import declarations do not affect the type-only classification.
      }
    }
    const typeSpecifier = readOtherTypeSpecifier(node)
    if (typeSpecifier) {
      explicitTypes.add(typeSpecifier)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(source)
  return { mixedDefaults, explicitTypes }
}

function readOtherTypeSpecifier(node: TypeScript.Node): string | undefined {
  if (TypeScript.isExportDeclaration(node)) {
    const { moduleSpecifier, isTypeOnly, exportClause } = node
    const isExplicitType = isTypeOnly || hasOnlyNamedTypeSpecifiers(exportClause)
    if (isExplicitType && moduleSpecifier && TypeScript.isStringLiteralLike(moduleSpecifier)) {
      return moduleSpecifier.text
    }
  }
  if (TypeScript.isImportTypeNode(node) && TypeScript.isLiteralTypeNode(node.argument)) {
    const literal = node.argument.literal
    if (TypeScript.isStringLiteralLike(literal)) {
      return literal.text
    }
  }
}

type PossibleBindings = TypeScript.NamedImportBindings | TypeScript.NamedExportBindings | undefined

function hasOnlyNamedTypeSpecifiers(node: PossibleBindings): boolean {
  if (node === undefined) {
    return false
  }
  return (TypeScript.isNamedImports(node) || TypeScript.isNamedExports(node))
    && node.elements.every(item => item.isTypeOnly)
}

type Dependency = DependencyCruiser.IDependency

function isReportedTypeImport(dependency: Dependency): boolean {
  return dependency.dependencyTypes.includes('type-only')
}

type PossibleTypeImportSyntax = TypeImportSyntax | undefined

function resolveImportKinds(
  dependency: Dependency,
  dependencies: readonly Dependency[],
  syntax: PossibleTypeImportSyntax,
): ImportKind[] {
  const emittedKind = dependency.preCompilationOnly ? 'compile-only' : 'value'
  if (!isReportedTypeImport(dependency)) {
    return [emittedKind]
  }
  if (!syntax?.mixedDefaults.has(dependency.module)) {
    return ['type']
  }
  // Dependency-cruiser marks a default import with only named type specifiers as type-only.
  // It also collapses that record with any explicit type import of the same specifier.
  const kinds: ImportKind[] = []
  if (!dependencies.some(other => alsoReportsNonTypeKind(other, dependency))) {
    kinds.push(emittedKind)
  }
  if (syntax.explicitTypes.has(dependency.module)) {
    kinds.push('type')
  }
  return kinds
}

function alsoReportsNonTypeKind(other: Dependency, mixed: Dependency): boolean {
  const sameSpecifier = other.module === mixed.module && other.resolved === mixed.resolved
  return sameSpecifier && !isReportedTypeImport(other) && other.preCompilationOnly === mixed.preCompilationOnly
}
