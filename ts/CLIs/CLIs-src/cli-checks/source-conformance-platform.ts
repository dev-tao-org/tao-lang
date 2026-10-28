import { Platform } from '@shared/os'
import * as TypeScript from 'typescript'

/** platformAccessIssue reports runtime-specific references outside the OS abstraction. */
export function platformAccessIssue(node: TypeScript.Node, filename: string): string | undefined {
  if (isBuiltinReference(node)) {
    if (isOwnedBuiltinReference(node, filename)) {
      return
    }
    return 'runtime builtin imports belong in @shared/os'
  }
  if (filename.replaceAll('\\', '/').startsWith('ts/shared/shared-src/os/')) {
    return
  }
  if (isPlatformGlobal(node) && !isUniversalTimeAccess(node, filename)) {
    return 'platform globals belong in @shared/os; use its named APIs'
  }
}

type MemberAccess = TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression

function isOwnedBuiltinReference(node: TypeScript.Node, filename: string): boolean {
  const normalizedFilename = filename.replaceAll('\\', '/')
  if (normalizedFilename === 'ts/shared/shared-src/os/NodeBuiltins.ts') {
    return true
  }
  if (isExplicitBuiltinMockFixture(node, normalizedFilename)) {
    return true
  }
  return false
}

function isExplicitBuiltinMockFixture(node: TypeScript.Node, filename: string): boolean {
  const specifier = builtinSpecifier(node)
  if (specifier === undefined || explicitBuiltinMockFixtures.get(filename)?.has(specifier) !== true) {
    return false
  }
  return TypeScript.isCallExpression(node.parent) && isDynamicImport(node.parent)
}

function isDynamicImport(node: TypeScript.CallExpression): boolean {
  return node.expression.kind === TypeScript.SyntaxKind.ImportKeyword
}

const platformGlobals = new Set([
  'process',
  'Bun',
  'Buffer',
  'Deno',
  'crypto',
  'performance',
  'fetch',
  'WebSocket',
  'Worker',
  'Response',
  'Request',
  'Headers',
  'ReadableStream',
  'WritableStream',
  'console',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
])

const explicitBuiltinMockFixtures = new Map<string, ReadonlySet<string>>([
  ['ts/shared/shared-src/os/Files-test/GeneratedMetadata.test.ts', new Set(['node:fs/promises'])],
  ['ts/shared/shared-src/os/Storage-test/LeaseFailures.test.ts', new Set(['node:fs/promises'])],
  ['ts/shared/shared-src/os/SessionLock-test/PointerDiagnostics.test.ts', new Set(['node:fs/promises'])],
])

function isUniversalTimeAccess(node: TypeScript.Node, filename: string): boolean {
  if (filename.replaceAll('\\', '/') !== 'ts/shared/shared-src/universal/Time.ts') {
    return false
  }
  return isWallClockAccess(node)
    || (TypeScript.isIdentifier(node) && ['performance', 'setTimeout', 'clearTimeout'].includes(node.text))
}

function isBuiltinReference(node: TypeScript.Node): boolean {
  const specifier = builtinSpecifier(node)
  if (specifier === undefined || !isPlatformSpecifier(specifier)) {
    return false
  }
  const parent = node.parent
  const isStaticImport = TypeScript.isImportDeclaration(parent) || TypeScript.isExportDeclaration(parent)
    || TypeScript.isExternalModuleReference(parent)
  return isStaticImport || isRuntimeImportCall(parent) || isImportTypeArgument(parent)
}

function builtinSpecifier(node: TypeScript.Node): string | undefined {
  if (TypeScript.isStringLiteralLike(node)) {
    return node.text
  }
  if (TypeScript.isTemplateExpression(node)) {
    return node.head.text
  }
  return undefined
}

function isPlatformSpecifier(specifier: string): boolean {
  return specifier.startsWith('node:') || specifier.startsWith('bun:') || Platform.isPlatformImport(specifier)
}

function isRuntimeImportCall(node: TypeScript.Node): boolean {
  if (!TypeScript.isCallExpression(node)) {
    return false
  }
  return node.expression.kind === TypeScript.SyntaxKind.ImportKeyword
    || (TypeScript.isIdentifier(node.expression) && node.expression.text === 'require')
}

function isImportTypeArgument(node: TypeScript.Node): boolean {
  return TypeScript.isLiteralTypeNode(node) && TypeScript.isImportTypeNode(node.parent)
}

function isPlatformGlobal(node: TypeScript.Node): boolean {
  if (isGlobalPropertyAccess(node) || isWallClockAccess(node)) {
    return true
  }
  if (!TypeScript.isIdentifier(node) || !platformGlobals.has(node.text)) {
    return false
  }
  return !isPropertyName(node)
}

function isWallClockAccess(node: TypeScript.Node): boolean {
  if (TypeScript.isPropertyAccessExpression(node) || TypeScript.isElementAccessExpression(node)) {
    return isDateReference(node.expression) && memberName(node) === 'now'
  }
  if (TypeScript.isNewExpression(node)) {
    return isDateReference(node.expression) && !node.arguments?.length
  }
  return TypeScript.isCallExpression(node) && isDateReference(node.expression)
}

function isDateReference(node: TypeScript.Node): boolean {
  if (TypeScript.isIdentifier(node)) {
    return node.text === 'Date'
  }
  return isGlobalMember(node, 'Date')
}

function isPropertyName(node: TypeScript.Identifier): boolean {
  const parent = node.parent
  if (TypeScript.isPropertyAccessExpression(parent)) {
    return parent.name === node
  }
  if (hasDeclaredPropertyName(parent)) {
    return parent.name === node
  }
  return TypeScript.isBindingElement(parent) && parent.propertyName === node
}

function hasDeclaredPropertyName(node: TypeScript.Node): node is NamedPropertyDeclaration {
  if (TypeScript.isPropertyAssignment(node) || TypeScript.isPropertySignature(node)) {
    return true
  }
  if (TypeScript.isPropertyDeclaration(node) || TypeScript.isMethodSignature(node)) {
    return true
  }
  if (TypeScript.isMethodDeclaration(node) || TypeScript.isGetAccessorDeclaration(node)) {
    return true
  }
  return TypeScript.isSetAccessorDeclaration(node) || TypeScript.isEnumMember(node)
}

type NamedPropertyDeclaration =
  | TypeScript.PropertyAssignment
  | TypeScript.PropertySignature
  | TypeScript.PropertyDeclaration
  | TypeScript.MethodSignature
  | TypeScript.MethodDeclaration
  | TypeScript.GetAccessorDeclaration
  | TypeScript.SetAccessorDeclaration
  | TypeScript.EnumMember

function isGlobalPropertyAccess(node: TypeScript.Node): boolean {
  if (!TypeScript.isPropertyAccessExpression(node) && !TypeScript.isElementAccessExpression(node)) {
    return false
  }
  const name = memberName(node)
  return name !== undefined && platformGlobals.has(name) && isGlobalMember(node, name)
}

function isGlobalMember(node: TypeScript.Node, name: string): boolean {
  if (!TypeScript.isPropertyAccessExpression(node) && !TypeScript.isElementAccessExpression(node)) {
    return false
  }
  return TypeScript.isIdentifier(node.expression) && node.expression.text === 'globalThis'
    && memberName(node) === name
}

function memberName(
  node: MemberAccess,
): string | undefined {
  if (TypeScript.isPropertyAccessExpression(node)) {
    return node.name.text
  }
  if (TypeScript.isElementAccessExpression(node)) {
    return TypeScript.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined
  }
}
