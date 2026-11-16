import { Regxs, Sort } from '@shared'
import { Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import * as OptionalArguments from './OptionalArgumentUsage'
import { isExcludedSource } from './source-size'
import { readModuleReference } from './TestOnlyUsage-Modules'

/** UsageRoots identifies executable roots and independently consumed external contracts. */
export type UsageRoots = { root: string; entries: ReadonlySet<string>; contracts: ReadonlySet<string> }
/** UsageLocation identifies a source reference or declaration in the workspace. */
export type UsageLocation = { file: string; line: number }
/** ModuleUsage records a test-reached production file and an import that reaches it. */
export type ModuleUsage = { file: string; testReference: UsageLocation }
/** TestOnlyUsage describes static candidates that need production-contract review. */
export type TestOnlyUsage = {
  modules: ModuleUsage[]
  declarations: DeclarationUsage[]
  optionalArguments: OptionalArgumentUsage[]
}

type DeclarationUsage = { name: string; declaration: UsageLocation; testReference: UsageLocation }
type OptionalArgumentUsage = { name: string; declaration: UsageLocation; testReference: UsageLocation }
type ModuleImports = Map<TypeScript.SourceFile, UsageLocation>
type SymbolReferences = Map<TypeScript.Symbol, UsageLocation>
type ModuleReferences = Map<TypeScript.SourceFile, ModuleReferencesInFile>
type ModuleReferencesInFile = {
  test: boolean
  imports: ModuleImports
  references: SymbolReferences
  calls: OptionalArguments.OptionalCallReference[]
}

/** analyzeTestOnlyUsage compares test and production references in an existing TypeScript program. */
export function analyzeTestOnlyUsage(
  program: TypeScript.Program,
  filenames: readonly string[],
  usageRoots: UsageRoots,
): TestOnlyUsage {
  const checker = program.getTypeChecker()
  const roots = normalizeUsageRoots(usageRoots)
  const files = filenames.flatMap(filename => program.getSourceFile(filename) ?? [])
  const graph: ModuleReferences = new Map(files.map(file => [file, readReferences(file, checker, roots.root)]))
  const testFiles = files.filter(file => graph.get(file)!.test)
  const testImports = resolveImports(graph, testFiles)
  const productionFiles = files.filter(file => !graph.get(file)!.test && isProductionRoot(file, roots, testImports))
  const productionImports = resolveImports(graph, productionFiles)
  const production = new Set([...productionFiles, ...productionImports.keys()])
  const references = collectUsageReferences(graph, production, roots, checker)
  const result: TestOnlyUsage = { modules: [], declarations: [], optionalArguments: findOptionalArguments(references) }
  for (const file of files) {
    if (graph.get(file)!.test || !canReportFile(file)) {
      continue
    }
    const testReference = testImports.get(file)
    if (testReference && !production.has(file)) {
      result.modules.push({ file: file.fileName, testReference })
    } else {
      appendDeclarationUsage(result.declarations, file, checker, references, roots)
    }
  }
  result.modules.sort(Sort.By(item => item.file, Sort.CompareStrings))
  return result
}

function normalizeUsageRoots({ root, entries, contracts }: UsageRoots): UsageRoots {
  return { root, entries: normalizeUsagePaths(entries), contracts: normalizeUsagePaths(contracts) }
}

function normalizeUsagePaths(paths: ReadonlySet<string>): ReadonlySet<string> {
  return new Set([...paths].map(Path.toPortablePath))
}

function findOptionalArguments(references: ScopedSymbolReferences): OptionalArgumentUsage[] {
  return OptionalArguments.findTestOnlyOptionalArguments(references.calls, references.external)
    .filter(({ parameter }) => canReportFile(parameter.getSourceFile()))
    .map(({ parameter, testSite }) => ({
      name: parameter.name.getText(),
      declaration: nodeLocation(parameter.getSourceFile(), parameter.name),
      testReference: nodeLocation(testSite.getSourceFile(), testSite),
    }))
}

const TestDirectoryPrefix = 'test-'

function isTestFile(root: string, filename: string): boolean {
  const directory = Path.relative(root, Path.dirname(filename))
  const segments = directory.split(Path.sep)
  return Regxs.TestSourceSuffix.test(filename) || segments.some(segment => segment.startsWith(TestDirectoryPrefix))
}

function isProductionRoot(file: TypeScript.SourceFile, roots: UsageRoots, testImports: ModuleImports): boolean {
  const path = Path.toPortablePath(file.fileName)
  return !testImports.has(file) || roots.entries.has(path) || roots.contracts.has(path)
}

function canReportFile(file: TypeScript.SourceFile): boolean {
  return !file.isDeclarationFile && !isExcludedSource(file.fileName, file.text)
}

function resolveImports(graph: ModuleReferences, roots: readonly TypeScript.SourceFile[]): ModuleImports {
  const imports: ModuleImports = new Map()
  const pending = [...roots]
  for (const source of pending) {
    for (const [target, reference] of graph.get(source)?.imports ?? []) {
      if (!imports.has(target)) {
        imports.set(target, reference)
        pending.push(target)
      }
    }
  }
  return imports
}

function readReferences(
  file: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  root: string,
): ModuleReferencesInFile {
  const found: ModuleReferencesInFile = {
    test: isTestFile(root, file.fileName),
    imports: new Map(),
    references: new Map(),
    calls: [],
  }
  const visit = (node: TypeScript.Node): void => {
    const imported = readModuleReference(node, checker)
    if (imported && !found.imports.has(imported.source)) {
      found.imports.set(imported.source, nodeLocation(file, imported.specifier))
    }
    if (TypeScript.isImportDeclaration(node) || TypeScript.isExportDeclaration(node)) {
      return
    }
    const symbol = readReferenceSymbol(node, checker)
    if (symbol) {
      recordSymbolReference(found, symbol, node, file)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return found
}

function readReferenceSymbol(node: TypeScript.Node, checker: TypeScript.TypeChecker): TypeScript.Symbol | undefined {
  if (!canReferenceSymbol(node)) {
    return
  }
  const referenced = readSymbol(checker, node)
  if (referenced === undefined || isDeclarationName(referenced, node)) {
    return
  }
  const symbol = resolveSymbol(checker, readBindingSymbol(checker, referenced) ?? referenced)
  if (symbol === undefined || (isModuleSymbol(symbol) && isPropertyReceiver(node))) {
    return
  }
  return symbol
}

function recordSymbolReference(
  found: ModuleReferencesInFile,
  symbol: TypeScript.Symbol,
  node: TypeScript.Node,
  file: TypeScript.SourceFile,
): void {
  if (!found.references.has(symbol)) {
    found.references.set(symbol, nodeLocation(file, node))
  }
  const call = OptionalArguments.readOptionalCallReference(symbol, node)
  if (call) {
    found.calls.push(call)
  }
}

function canReferenceSymbol(node: TypeScript.Node): boolean {
  if (TypeScript.isIdentifier(node)) {
    return true
  }
  return TypeScript.isStringLiteralLike(node) && TypeScript.isElementAccessExpression(node.parent)
}

function isDeclarationName(symbol: TypeScript.Symbol, node: TypeScript.Node): boolean {
  return symbol.declarations?.some(declaration => TypeScript.getNameOfDeclaration(declaration) === node) ?? false
}

function isPropertyReceiver(node: TypeScript.Node): boolean {
  const parent = node.parent
  if (TypeScript.isQualifiedName(parent) || TypeScript.isTypeQueryNode(parent)) {
    return true
  }
  if (TypeScript.isPropertyAccessExpression(parent)) {
    return parent.expression === node
  }
  const isStaticElementAccess = TypeScript.isElementAccessExpression(parent)
    && TypeScript.isStringLiteralLike(parent.argumentExpression)
  return isStaticElementAccess && parent.expression === node
}

function readSymbol(checker: TypeScript.TypeChecker, node: TypeScript.Node): TypeScript.Symbol | undefined {
  if (TypeScript.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
    return checker.getShorthandAssignmentValueSymbol(node.parent)
  }
  return checker.getSymbolAtLocation(node)
}

function readBindingSymbol(checker: TypeScript.TypeChecker, symbol: TypeScript.Symbol): TypeScript.Symbol | undefined {
  const binding = symbol.valueDeclaration
  if (binding === undefined || !TypeScript.isBindingElement(binding)) {
    return
  }
  if (!TypeScript.isObjectBindingPattern(binding.parent)) {
    return
  }
  const key = binding.propertyName ?? binding.name
  if (TypeScript.isIdentifier(key) || TypeScript.isStringLiteralLike(key)) {
    return checker.getPropertyOfType(checker.getTypeAtLocation(binding.parent), key.text)
  }
}

type PossibleSymbol = TypeScript.Symbol | undefined

function resolveSymbol(
  checker: TypeScript.TypeChecker,
  symbol: PossibleSymbol,
): TypeScript.Symbol | undefined {
  if (symbol && (symbol.flags & TypeScript.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(symbol)
  }
  return symbol
}

type ScopedSymbolReferences = {
  production: Set<TypeScript.Symbol>
  external: Set<TypeScript.Symbol>
  tests: SymbolReferences
  calls: OptionalArguments.ScopedOptionalCalls
}

function collectUsageReferences(
  graph: ModuleReferences,
  production: ReadonlySet<TypeScript.SourceFile>,
  roots: UsageRoots,
  checker: TypeScript.TypeChecker,
): ScopedSymbolReferences {
  const result: ScopedSymbolReferences = {
    production: new Set(),
    external: new Set(),
    tests: new Map(),
    calls: { production: [], tests: [] },
  }
  for (const [file, { references, test, calls }] of graph) {
    if (!production.has(file) || test) {
      for (const [symbol, location] of references) {
        result.tests.set(symbol, location)
      }
      result.calls.tests.push(...calls)
      continue
    }
    result.calls.production.push(...calls)
    for (const symbol of references.keys()) {
      if (isModuleSymbol(symbol)) {
        registerExternalReference(result.external, checker, symbol)
      } else {
        result.production.add(symbol)
      }
    }
    if (roots.contracts.has(Path.toPortablePath(file.fileName))) {
      const namespace = checker.getSymbolAtLocation(file)
      if (namespace) {
        registerExternalReference(result.external, checker, namespace)
      }
    }
  }
  return result
}

function registerExternalReference(
  external: Set<TypeScript.Symbol>,
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol,
): void {
  if (external.has(symbol)) {
    return
  }
  external.add(symbol)
  // A namespace may be invoked through host code or dynamic property access.
  if (isModuleSymbol(symbol)) {
    for (const exported of checker.getExportsOfModule(symbol)) {
      const resolved = resolveSymbol(checker, exported)
      if (resolved) {
        registerExternalReference(external, checker, resolved)
      }
    }
  }
}

function isModuleSymbol(symbol: TypeScript.Symbol): boolean {
  return symbol.valueDeclaration?.kind === TypeScript.SyntaxKind.SourceFile
}

function appendDeclarationUsage(
  findings: DeclarationUsage[],
  file: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  references: ScopedSymbolReferences,
  roots: UsageRoots,
): void {
  const module = checker.getSymbolAtLocation(file)
  if (!module) {
    return
  }
  for (const exported of checker.getExportsOfModule(module)) {
    const resolved = resolveSymbol(checker, exported)!
    const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0]
    const testReference = references.tests.get(resolved)
    const localDeclaration = declaration?.getSourceFile() === file
    const candidate = localDeclaration && !references.production.has(resolved) && !references.external.has(resolved)
    if (testReference && candidate && !runsAtEntry(file, declaration, roots)) {
      findings.push({ name: resolved.getName(), declaration: nodeLocation(file, declaration), testReference })
    }
  }
}

function runsAtEntry(file: TypeScript.SourceFile, declaration: TypeScript.Declaration, roots: UsageRoots): boolean {
  if (!roots.entries.has(Path.toPortablePath(file.fileName)) || !TypeScript.isExportAssignment(declaration)) {
    return false
  }
  return TypeScript.isCallExpression(declaration.expression)
}

function nodeLocation(file: TypeScript.SourceFile, node: TypeScript.Node): UsageLocation {
  return { file: file.fileName, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 }
}
