import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { type SourceBridgeContext, sourceBridgeOwnerIssue } from './source-bridge-owners'

/** sourceBridgeIssue rejects external module references outside their exact package bridge. */
export function sourceBridgeIssue(
  node: TypeScript.Node,
  filename: string,
  context: SourceBridgeContext,
  loaderAliases: ReadonlySet<string>,
  excludedSource: boolean,
): string | undefined {
  if (excludedSource) {
    return
  }
  const specifier = externalModuleSpecifier(node, loaderAliases)
  if (specifier === undefined) {
    return
  }
  if (isExplicitBuiltinMockFixture(node, filename, specifier)) {
    return
  }
  return sourceBridgeOwnerIssue(filename, specifier, context)
}

/** sourceBridgeLoaderAliases finds local aliases of supported literal module loaders once per file. */
export function sourceBridgeLoaderAliases(file: TypeScript.SourceFile): Set<string> {
  const aliases = new Set(['require'])
  let changed = true
  while (changed) {
    changed = false
    const visit = (node: TypeScript.Node): void => {
      if (
        TypeScript.isVariableDeclaration(node) && TypeScript.isIdentifier(node.name)
        && isLoaderAlias(node.initializer, aliases)
      ) {
        const previousSize = aliases.size
        aliases.add(node.name.text)
        changed ||= aliases.size !== previousSize
      }
      TypeScript.forEachChild(node, visit)
    }
    visit(file)
  }
  return aliases
}

function isExplicitBuiltinMockFixture(node: TypeScript.Node, filename: string, specifier: string): boolean {
  return specifier === 'node:fs/promises' && isDynamicImportCall(node) && [
    'ts/shared/shared-src/os/Files-test/GeneratedMetadata.test.ts',
    'ts/shared/shared-src/os/Storage-test/LeaseFailures.test.ts',
    'ts/shared/shared-src/os/SessionLock-test/PointerDiagnostics.test.ts',
  ].includes(filename.replaceAll('\\', '/'))
}

function externalModuleSpecifier(node: TypeScript.Node, loaderAliases: ReadonlySet<string>): string | undefined {
  if (!TypeScript.isStringLiteralLike(node) && !TypeScript.isNoSubstitutionTemplateLiteral(node)) {
    return
  }
  const parent = node.parent
  if (
    (TypeScript.isImportDeclaration(parent) || TypeScript.isExportDeclaration(parent))
    && parent.moduleSpecifier === node
  ) {
    return node.text
  }
  if (TypeScript.isExternalModuleReference(parent) && parent.expression === node) {
    return node.text
  }
  if (TypeScript.isLiteralTypeNode(parent) && TypeScript.isImportTypeNode(parent.parent)) {
    return node.text
  }
  if (!TypeScript.isCallExpression(parent) || parent.arguments[0] !== node) {
    return
  }
  if (isModuleLoadingCall(parent.expression, loaderAliases) || isPlatformLoadModuleCall(parent.expression)) {
    return node.text
  }
}

function isModuleLoadingCall(expression: TypeScript.Expression, loaderAliases: ReadonlySet<string>): boolean {
  if (expression.kind === TypeScript.SyntaxKind.ImportKeyword) {
    return true
  }
  if (TypeScript.isIdentifier(expression)) {
    return loaderAliases.has(expression.text)
  }
  if (TypeScript.isCallExpression(expression)) {
    return isLoaderFactory(expression.expression)
  }
  return TypeScript.isPropertyAccessExpression(expression) && expression.name.text === 'resolve'
    && isModuleLoadingCall(expression.expression, loaderAliases)
}

function isPlatformLoadModuleCall(expression: TypeScript.Expression): boolean {
  return TypeScript.isPropertyAccessExpression(expression) && expression.name.text === 'loadModule'
    && TypeScript.isIdentifier(expression.expression) && expression.expression.text === 'Platform'
}

function isDynamicImportCall(node: TypeScript.Node): boolean {
  return TypeScript.isCallExpression(node.parent) && node.parent.arguments[0] === node
    && node.parent.expression.kind === TypeScript.SyntaxKind.ImportKeyword
}

function isLoaderAlias(initializer: TypeScript.Expression | undefined, aliases: ReadonlySet<string>): boolean {
  if (initializer === undefined) {
    return false
  }
  if (TypeScript.isIdentifier(initializer)) {
    return aliases.has(initializer.text) || initializer.text === 'createRequire'
  }
  if (TypeScript.isPropertyAccessExpression(initializer)) {
    return TypeScript.isIdentifier(initializer.expression) && aliases.has(initializer.expression.text)
        && initializer.name.text === 'resolve'
      || TypeScript.isIdentifier(initializer.expression) && initializer.expression.text === 'Platform'
        && initializer.name.text === 'loadModule'
  }
  return TypeScript.isCallExpression(initializer) && isLoaderFactory(initializer.expression)
}

function isLoaderFactory(expression: TypeScript.Expression): boolean {
  const name = loaderFactoryName(expression)
  return name !== undefined
    && ['createRequire', 'createExpoLoader', 'createExpoCliLoader', 'createMetroLoader'].includes(name)
}

function loaderFactoryName(expression: TypeScript.Expression): string | undefined {
  if (TypeScript.isIdentifier(expression)) {
    return expression.text
  }
  return TypeScript.isPropertyAccessExpression(expression) ? expression.name.text : undefined
}
