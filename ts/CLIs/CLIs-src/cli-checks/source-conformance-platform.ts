import { Platform } from '@shared/os'
import * as TypeScript from 'typescript'

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

/** platformAccessIssue reports runtime-specific references outside the OS abstraction. */
export function platformAccessIssue(node: TypeScript.Node, filename: string): string | undefined {
  if (filename.replaceAll('\\', '/').startsWith('ts/shared/shared-src/os/')) {
    return
  }
  if (isBuiltinReference(node)) {
    return 'runtime builtin imports belong in @shared/os'
  }
  if (isPlatformGlobal(node) && !isUniversalTimeAccess(node, filename)) {
    return 'platform globals belong in @shared/os; use its named APIs'
  }
}

function isUniversalTimeAccess(node: TypeScript.Node, filename: string): boolean {
  if (filename.replaceAll('\\', '/') !== 'ts/shared/shared-src/universal/Time.ts') {
    return false
  }
  return isWallClockAccess(node)
    || (TypeScript.isIdentifier(node) && (node.text === 'performance' || node.text === 'setTimeout'))
}

function isBuiltinReference(node: TypeScript.Node): boolean {
  if (!TypeScript.isStringLiteral(node) || !Platform.isPlatformImport(node.text)) {
    return false
  }
  const parent = node.parent
  return TypeScript.isImportDeclaration(parent) || TypeScript.isExportDeclaration(parent)
    || isRuntimeImportCall(parent) || isImportTypeArgument(parent)
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
  if (
    TypeScript.isPropertyAssignment(parent) || TypeScript.isPropertySignature(parent)
    || TypeScript.isPropertyDeclaration(parent) || TypeScript.isMethodSignature(parent)
    || TypeScript.isMethodDeclaration(parent) || TypeScript.isGetAccessorDeclaration(parent)
    || TypeScript.isSetAccessorDeclaration(parent) || TypeScript.isEnumMember(parent)
  ) {
    return parent.name === node
  }
  return TypeScript.isBindingElement(parent) && parent.propertyName === node
}

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
  node: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression,
): string | undefined {
  if (TypeScript.isPropertyAccessExpression(node)) {
    return node.name.text
  }
  if (TypeScript.isElementAccessExpression(node)) {
    return TypeScript.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined
  }
}
