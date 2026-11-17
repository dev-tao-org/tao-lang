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
  if (dependencies.length === 0) {
    return []
  }
  const syntax = readTypeImportSyntax(Path.join(workspace, module.source))
  const classified = dependencies.flatMap(dependency =>
    resolveImportKinds(dependency, dependencies, syntax).map(kind => ({ dependency, kind }))
  )
  return classified.filter((edge, index) => classified.findIndex(other => sameEdge(edge, other)) === index)
}

function sameEdge(left: ClassifiedImport, right: ClassifiedImport): boolean {
  return left.kind === right.kind && hasSameTarget(left.dependency, right.dependency)
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
      } else if (clause?.name && hasEmptyNamedImports(clause.namedBindings)) {
        mixedDefaults.add(node.moduleSpecifier.text)
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

function hasEmptyNamedImports(node: PossibleBindings): boolean {
  if (!node) {
    return false
  }
  return TypeScript.isNamedImports(node) && node.elements.length === 0
}

function hasOnlyNamedTypeSpecifiers(node: PossibleBindings): boolean {
  if (node === undefined) {
    return false
  }
  if (!(TypeScript.isNamedImports(node) || TypeScript.isNamedExports(node))) {
    return false
  }
  return node.elements.length > 0 && node.elements.every(item => item.isTypeOnly)
}

type Dependency = DependencyCruiser.IDependency

function isReportedTypeImport(dependency: Dependency): boolean {
  return dependency.dependencyTypes.includes('type-only')
}

function isErasedStaticImport(dependency: Dependency): boolean {
  if (!dependency.preCompilationOnly) {
    return false
  }
  const types = dependency.dependencyTypes
  return types.includes('import') || types.includes('export')
}

function resolveImportKinds(
  dependency: Dependency,
  dependencies: readonly Dependency[],
  syntax: TypeImportSyntax,
): ImportKind[] {
  const emittedKind = dependency.preCompilationOnly ? 'compile-only' : 'value'
  if (!isReportedTypeImport(dependency)) {
    return resolveNonTypeImportKinds(dependency, syntax)
  }
  if (!syntax.mixedDefaults.has(dependency.module)) {
    return ['type']
  }
  // Dependency-cruiser marks a default import with only named type specifiers as type-only.
  // It also collapses that record with any explicit type import of the same specifier.
  const kinds: ImportKind[] = []
  const hasOtherKind = dependencies.some(other => alsoReportsNonTypeKind(other, dependency, syntax, emittedKind))
  if (!hasOtherKind) {
    kinds.push(emittedKind)
  }
  if (syntax.explicitTypes.has(dependency.module)) {
    kinds.push('type')
  }
  return kinds
}

function resolveNonTypeImportKinds(
  dependency: Dependency,
  syntax: TypeImportSyntax,
): ImportKind[] {
  const module = dependency.module
  const esm = dependency.moduleSystem === 'es6'
  const fromInlineType = esm && syntax.inlineTypes.has(module) && dependency.dependencyTypes.includes('type-import')
  const kinds: ImportKind[] = []
  const dynamic = esm && syntax.dynamicImports.has(module)
  if (dynamic || !dependency.preCompilationOnly) {
    kinds.push('value')
  }
  if (esm && syntax.explicitTypes.has(module)) {
    kinds.push('type')
  }
  if (needsErasedEdge(dependency, fromInlineType, dynamic)) {
    kinds.push('compile-only')
  }
  return kinds
}

function needsErasedEdge(dependency: Dependency, fromInlineType: boolean, dynamic: boolean): boolean {
  if (!dependency.preCompilationOnly || fromInlineType) {
    return false
  }
  return !dynamic || isErasedStaticImport(dependency)
}

function alsoReportsNonTypeKind(
  other: Dependency,
  mixed: Dependency,
  syntax: TypeImportSyntax,
  expectedKind: ImportKind,
): boolean {
  if (!hasSameTarget(other, mixed) || isReportedTypeImport(other)) {
    return false
  }
  return resolveNonTypeImportKinds(other, syntax).includes(expectedKind)
}

function hasSameTarget(left: Dependency, right: Dependency): boolean {
  return left.module === right.module && left.resolved === right.resolved
}
