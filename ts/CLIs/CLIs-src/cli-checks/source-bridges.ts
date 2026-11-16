import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { type SourceBridgeContext, sourceBridgeOwnerIssue } from './source-bridge-owners'

/** SourceLoaderAliases tracks actual loader bindings without conflating shadowed names. */
export type SourceLoaderAliases = {
  checker: TypeScript.TypeChecker
  symbols: Set<TypeScript.Symbol>
  synthetic: boolean
}

/** sourceBridgeIssue rejects external module references outside their exact package bridge. */
export function sourceBridgeIssue(
  node: TypeScript.Node,
  filename: string,
  context: SourceBridgeContext,
  loaderAliases: SourceLoaderAliases,
  excludedSource: boolean,
): string | undefined {
  if (excludedSource) {
    return
  }
  const specifier = sourceModuleSpecifier(node, loaderAliases)
  if (specifier === undefined) {
    return
  }
  if (isExplicitBuiltinMockFixture(node, filename, specifier)) {
    return
  }
  return sourceBridgeOwnerIssue(filename, specifier, context)
}

/** sourceBridgeLoaderAliases finds local aliases of supported literal module loaders once per file. */
export function sourceBridgeLoaderAliases(
  file: TypeScript.SourceFile,
  checker?: TypeScript.TypeChecker,
): SourceLoaderAliases {
  const aliases: SourceLoaderAliases = {
    checker: checker ?? createBindingChecker(file),
    symbols: new Set(),
    synthetic: checker === undefined,
  }
  let changed = true
  while (changed) {
    changed = false
    const visit = (node: TypeScript.Node): void => {
      if (isLoaderAliasDeclaration(node, aliases)) {
        const symbol = aliases.checker.getSymbolAtLocation(node.name)
        if (symbol !== undefined && !aliases.symbols.has(symbol)) {
          aliases.symbols.add(symbol)
          changed = true
        }
      }
      TypeScript.forEachChild(node, visit)
    }
    visit(file)
  }
  return aliases
}

/** sourceModuleSpecifier reads literal module targets and statically known platform template families. */
export function sourceModuleSpecifier(node: TypeScript.Node, loaderAliases: SourceLoaderAliases): string | undefined {
  const specifier = readKnownModuleTarget(node)
  if (specifier === undefined) {
    return
  }
  const parent = node.parent
  if (isModuleDeclarationSpecifier(parent, node)) {
    return specifier
  }
  if (TypeScript.isExternalModuleReference(parent) && parent.expression === node) {
    return specifier
  }
  if (TypeScript.isLiteralTypeNode(parent) && TypeScript.isImportTypeNode(parent.parent)) {
    return specifier
  }
  if (!TypeScript.isCallExpression(parent) || parent.arguments[0] !== node) {
    return
  }
  if (
    isModuleLoadingCall(parent.expression, loaderAliases) || isPlatformLoadModuleCall(parent.expression, loaderAliases)
  ) {
    return specifier
  }
}

type OptionalLoaderExpression = TypeScript.Expression | undefined

type NamedLoaderAlias = TypeScript.VariableDeclaration & { name: TypeScript.Identifier }

const NodeModuleFamily = 'node'
const BunModuleFamily = 'bun'

function readKnownModuleTarget(node: TypeScript.Node): string | undefined {
  if (TypeScript.isStringLiteralLike(node)) {
    return node.text
  }
  if (!TypeScript.isTemplateExpression(node)) {
    return
  }
  if (node.head.text.startsWith(`${NodeModuleFamily}:`)) {
    return NodeModuleFamily
  }
  if (node.head.text.startsWith(`${BunModuleFamily}:`)) {
    return BunModuleFamily
  }
}

function isModuleDeclarationSpecifier(parent: TypeScript.Node, node: TypeScript.Node): boolean {
  return (TypeScript.isImportDeclaration(parent) || TypeScript.isExportDeclaration(parent))
    && parent.moduleSpecifier === node
}

function isLoaderAliasDeclaration(node: TypeScript.Node, aliases: SourceLoaderAliases): node is NamedLoaderAlias {
  return TypeScript.isVariableDeclaration(node) && TypeScript.isIdentifier(node.name)
    && isLoaderAlias(node.initializer, aliases)
}

function createBindingChecker(file: TypeScript.SourceFile): TypeScript.TypeChecker {
  const options: TypeScript.CompilerOptions = { noLib: true, noResolve: true }
  const host = TypeScript.createCompilerHost(options)
  host.getSourceFile = filename => filename === file.fileName ? file : undefined
  return TypeScript.createProgram([file.fileName], options, host).getTypeChecker()
}

function isLoaderBinding(identifier: TypeScript.Identifier, aliases: SourceLoaderAliases): boolean {
  const symbol = aliases.checker.getSymbolAtLocation(identifier)
  if (symbol !== undefined && aliases.symbols.has(symbol)) {
    return true
  }
  const locallyDeclared = symbol?.declarations?.some(declaration =>
    declaration.getSourceFile() === identifier.getSourceFile()
  )
  return identifier.text === 'require' && !locallyDeclared
}

function isExplicitBuiltinMockFixture(node: TypeScript.Node, filename: string, specifier: string): boolean {
  return specifier === 'node:fs/promises' && isDynamicImportCall(node) && [
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
    'ts/shared/test-shared/os/Storage.LeaseFailures.test.ts',
    'ts/shared/test-shared/os/locks.FileLock.PointerDiagnostics.test.ts',
  ].includes(filename.replaceAll('\\', '/'))
}

function isModuleLoadingCall(expression: TypeScript.Expression, loaderAliases: SourceLoaderAliases): boolean {
  if (expression.kind === TypeScript.SyntaxKind.ImportKeyword) {
    return true
  }
  if (TypeScript.isIdentifier(expression)) {
    return isLoaderBinding(expression, loaderAliases)
  }
  if (TypeScript.isCallExpression(expression)) {
    return isLoaderFactory(expression.expression, loaderAliases)
  }
  return TypeScript.isPropertyAccessExpression(expression) && expression.name.text === 'resolve'
    && isModuleLoadingCall(expression.expression, loaderAliases)
}

function isPlatformLoadModuleCall(expression: TypeScript.Expression, aliases: SourceLoaderAliases): boolean {
  return TypeScript.isPropertyAccessExpression(expression) && expression.name.text === 'loadModule'
    && isKnownLoaderOperation(expression, 'loadModule', aliases)
}

function isDynamicImportCall(node: TypeScript.Node): boolean {
  return TypeScript.isCallExpression(node.parent) && node.parent.arguments[0] === node
    && node.parent.expression.kind === TypeScript.SyntaxKind.ImportKeyword
}

function isLoaderAlias(initializer: OptionalLoaderExpression, aliases: SourceLoaderAliases): boolean {
  if (initializer === undefined) {
    return false
  }
  if (TypeScript.isIdentifier(initializer)) {
    return isLoaderBinding(initializer, aliases) || isLoaderFactory(initializer, aliases)
  }
  if (TypeScript.isPropertyAccessExpression(initializer)) {
    const loader = TypeScript.isIdentifier(initializer.expression) && isLoaderBinding(initializer.expression, aliases)
    return loader && initializer.name.text === 'resolve' || isPlatformLoadModuleCall(initializer, aliases)
  }
  return TypeScript.isCallExpression(initializer) && isLoaderFactory(initializer.expression, aliases)
}

function isLoaderFactory(expression: TypeScript.Expression, aliases: SourceLoaderAliases): boolean {
  const name = loaderFactoryName(expression)
  return name !== undefined && name !== 'loadModule' && isKnownLoaderOperation(expression, name, aliases)
}

const loaderOperationOwners = new Map<string, string>([
  ['createRequire', '/node_modules/@types/node/module.d.ts'],
  ['createExpoLoader', '/ts/7-runtime/runtime-src/bridges/Bridge_expo/Bridge_expo-host.ts'],
  ['createExpoCliLoader', '/ts/7-runtime/runtime-src/bridges/Bridge_expo-cli/Bridge_expo-cli.ts'],
  ['createMetroLoader', '/ts/7-runtime/runtime-src/bridges/Bridge_expo-metro/Bridge_expo-metro.ts'],
  ['loadModule', '/ts/shared/shared-src/os/Platform.ts'],
])

function isKnownLoaderOperation(
  expression: TypeScript.Expression,
  name: string,
  aliases: SourceLoaderAliases,
): boolean {
  const owner = loaderOperationOwners.get(name)
  if (owner === undefined) {
    return false
  }
  const reference = aliases.checker.getSymbolAtLocation(expression)
  const symbol = reference && (reference.flags & TypeScript.SymbolFlags.Alias)
    ? aliases.checker.getAliasedSymbol(reference)
    : reference
  if (
    name === 'createRequire' && symbol?.declarations?.some(declaration => isNodeModuleDestructure(declaration, aliases))
  ) {
    return true
  }
  if (
    symbol?.declarations?.some(declaration =>
      declaration.getSourceFile().fileName.replaceAll('\\', '/').endsWith(owner)
    )
  ) {
    return true
  }
  return aliases.synthetic && symbol?.declarations === undefined && isUnboundLoaderReference(expression, aliases)
}

function isNodeModuleDestructure(declaration: TypeScript.Declaration, aliases: SourceLoaderAliases): boolean {
  if (!TypeScript.isBindingElement(declaration) || !TypeScript.isObjectBindingPattern(declaration.parent)) {
    return false
  }
  const property = declaration.propertyName ?? declaration.name
  const variable = declaration.parent.parent
  if (!TypeScript.isIdentifier(property) || property.text !== 'createRequire') {
    return false
  }
  return TypeScript.isVariableDeclaration(variable) && isLiteralNodeModuleLoad(variable.initializer, aliases)
}

function isLiteralNodeModuleLoad(
  initializer: OptionalLoaderExpression,
  aliases: SourceLoaderAliases,
): boolean {
  if (
    initializer === undefined || !TypeScript.isCallExpression(initializer)
    || !TypeScript.isIdentifier(initializer.expression)
  ) {
    return false
  }
  const specifier = initializer.arguments[0]
  const name = specifier === undefined ? undefined : sourceModuleSpecifier(specifier, aliases)
  return isLoaderBinding(initializer.expression, aliases) && (name === 'node:module' || name === 'module')
}

function isUnboundLoaderReference(expression: TypeScript.Expression, aliases: SourceLoaderAliases): boolean {
  const root = TypeScript.isPropertyAccessExpression(expression) ? expression.expression : expression
  const symbol = aliases.checker.getSymbolAtLocation(root)
  return symbol?.declarations === undefined
    || symbol.declarations.every(declaration =>
      TypeScript.isNamespaceImport(declaration) || TypeScript.isImportSpecifier(declaration)
    )
}

function loaderFactoryName(expression: TypeScript.Expression): string | undefined {
  if (TypeScript.isIdentifier(expression)) {
    return expression.text
  }
  return TypeScript.isPropertyAccessExpression(expression) ? expression.name.text : undefined
}
