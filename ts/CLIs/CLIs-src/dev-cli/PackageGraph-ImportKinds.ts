import { Sort } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import type { DependencyCruiser } from '../cli-kit/bridges/Bridge_dependency-cruiser'

/** ImportKind distinguishes emitted dependencies, explicit type declarations and other erased imports. */
export type ImportKind = 'value' | 'type' | 'compile-only'

type ClassifiedImport = { dependency: DependencyCruiser.IDependency; kind: ImportKind }
type TypeImportSyntax = {
  mixedDefaults: ReadonlySet<string>
  explicitTypes: ReadonlySet<string>
  inlineTypes: ReadonlySet<string>
  dynamicImports: ReadonlySet<string>
}

/** classifyModuleImports recovers type and value edges collapsed by dependency-cruiser. */
export function classifyModuleImports(workspace: string, module: DependencyCruiser.IModule): ClassifiedImport[] {
  const dependencies = module.dependencies.toSorted(Sort.By(dependency => dependency.module, Sort.CompareStrings))
  const syntax = dependencies.some(needsSourceClassification)
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
  const inlineTypes = new Set<string>()
  const dynamicImports = new Set<string>()
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
    const reExport = readTypeReExport(node)
    if (reExport !== undefined) {
      explicitTypes.add(reExport)
    }
    const inlineType = readInlineTypeImport(node)
    if (inlineType !== undefined) {
      inlineTypes.add(inlineType)
      explicitTypes.add(inlineType)
    }
    const dynamicImport = readDynamicImport(node)
    if (dynamicImport !== undefined) {
      dynamicImports.add(dynamicImport)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(source)
  return { mixedDefaults, explicitTypes, inlineTypes, dynamicImports }
}

function readTypeReExport(node: TypeScript.Node): string | undefined {
  if (TypeScript.isExportDeclaration(node)) {
    const { moduleSpecifier, isTypeOnly, exportClause } = node
    const isExplicitType = isTypeOnly || hasOnlyNamedTypeSpecifiers(exportClause)
    if (isExplicitType && moduleSpecifier && TypeScript.isStringLiteralLike(moduleSpecifier)) {
      return moduleSpecifier.text
    }
  }
}

function readInlineTypeImport(node: TypeScript.Node): string | undefined {
  if (TypeScript.isImportTypeNode(node) && TypeScript.isLiteralTypeNode(node.argument)) {
    const literal = node.argument.literal
    if (TypeScript.isStringLiteralLike(literal)) {
      return literal.text
    }
  }
}

function readDynamicImport(node: TypeScript.Node): string | undefined {
  if (!TypeScript.isCallExpression(node) || node.expression.kind !== TypeScript.SyntaxKind.ImportKeyword) {
    return
  }
  const [specifier] = node.arguments
  if (specifier && TypeScript.isStringLiteralLike(specifier)) {
    return specifier.text
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

function needsSourceClassification(dependency: Dependency): boolean {
  return isReportedTypeImport(dependency) || isReportedInlineImport(dependency)
}

function isReportedTypeImport(dependency: Dependency): boolean {
  return dependency.dependencyTypes.includes('type-only')
}

function isReportedInlineImport(dependency: Dependency): boolean {
  const types = dependency.dependencyTypes
  return types.includes('type-import') || types.includes('dynamic-import')
}

type PossibleTypeImportSyntax = TypeImportSyntax | undefined

function resolveImportKinds(
  dependency: Dependency,
  dependencies: readonly Dependency[],
  syntax: PossibleTypeImportSyntax,
): ImportKind[] {
  const emittedKind = dependency.preCompilationOnly ? 'compile-only' : 'value'
  if (!isReportedTypeImport(dependency)) {
    if (isCollapsedInlineImport(dependency, syntax)) {
      const hasTypeEdge = dependencies.some(other => hasSameTarget(other, dependency) && isReportedTypeImport(other))
      return hasTypeEdge ? ['value'] : ['value', 'type']
    }
    return [emittedKind]
  }
  if (!syntax?.mixedDefaults.has(dependency.module)) {
    return ['type']
  }
  // Dependency-cruiser marks a default import with only named type specifiers as type-only.
  // It also collapses that record with any explicit type import of the same specifier.
  const kinds: ImportKind[] = []
  if (!dependencies.some(other => alsoReportsNonTypeKind(other, dependency, syntax))) {
    kinds.push(emittedKind)
  }
  if (syntax.explicitTypes.has(dependency.module)) {
    kinds.push('type')
  }
  return kinds
}

function isCollapsedInlineImport(dependency: Dependency, syntax: PossibleTypeImportSyntax): boolean {
  // Dependency-cruiser deduplicates inline type and dynamic imports with the same specifier.
  const hasBothForms = syntax?.inlineTypes.has(dependency.module) && syntax.dynamicImports.has(dependency.module)
  return hasBothForms === true && isReportedInlineImport(dependency)
}

function alsoReportsNonTypeKind(other: Dependency, mixed: Dependency, syntax: PossibleTypeImportSyntax): boolean {
  if (!hasSameTarget(other, mixed) || isReportedTypeImport(other)) {
    return false
  }
  const preCompilationOnly = isCollapsedInlineImport(other, syntax) ? false : other.preCompilationOnly
  return preCompilationOnly === mixed.preCompilationOnly
}

function hasSameTarget(left: Dependency, right: Dependency): boolean {
  return left.module === right.module && left.resolved === right.resolved
}
