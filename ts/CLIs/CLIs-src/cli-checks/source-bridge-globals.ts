import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { isExcludedSource } from './source-size'

/** platformGlobalIssue keeps host globals within their platform bridge owner. */
export function platformGlobalIssue(
  node: TypeScript.Node,
  filename: string,
  checker?: TypeScript.TypeChecker,
  excludedSource = isExcludedSource(filename, node.getSourceFile().text),
): string | undefined {
  if (excludedSource || isUniversalTimeAccess(node, filename) || isBrowserExecutionCallback(node, checker)) {
    return
  }
  const globalName = referencedGlobalName(node)
  if (globalName === undefined || isLocalValue(node, checker)) {
    return
  }
  const owner = getGlobalOwnerPath(globalName)
  if (owner === undefined) {
    return `platform global "${globalName}" has no registered bridge owner`
  }
  if (filename.replaceAll('\\', '/') !== owner) {
    return `platform global "${globalName}" belongs in ${owner}`
  }
}

const browserGlobalNames = new Set([
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
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'XMLHttpRequest',
  'MutationObserver',
  'IntersectionObserver',
  'HTMLElement',
  'Element',
  'Node',
  'URL',
  'URLSearchParams',
  'Blob',
  'File',
  'FormData',
  'AbortController',
  'TextEncoder',
  'TextDecoder',
  'atob',
  'btoa',
  'queueMicrotask',
  'alert',
  'confirm',
  'prompt',
  'console',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
])

const platformGlobals = new Set(['process', 'Bun', 'Buffer', 'Date', ...browserGlobalNames])

function getGlobalOwnerPath(name: string): string | undefined {
  if (name === 'process' || name === 'Buffer') {
    return 'ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node.ts'
  }
  if (name === 'Bun') {
    return 'ts/shared/shared-src/os/bridges/Bridge_bun/Bridge_bun.ts'
  }
  if (name === 'Date') {
    return 'ts/shared/shared-src/universal/Time.ts'
  }
  if (browserGlobalNames.has(name)) {
    return 'ts/shared/shared-src/os/bridges/Bridge_browser/Bridge_browser.ts'
  }
}

function referencedGlobalName(node: TypeScript.Node): string | undefined {
  if (TypeScript.isIdentifier(node) && platformGlobals.has(node.text) && !isPropertyName(node)) {
    if (node.text !== 'Date' || isWallClockAccess(node)) {
      return node.text
    }
  }
  if (TypeScript.isPropertyAccessExpression(node) || TypeScript.isElementAccessExpression(node)) {
    const member = accessedMemberName(node)
    if (member !== undefined && platformGlobals.has(member) && isGlobalThisAccess(node)) {
      return member
    }
  }
}

function accessedMemberName(
  node: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression,
): string | undefined {
  if (TypeScript.isPropertyAccessExpression(node)) {
    return node.name.text
  }
  return TypeScript.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined
}

function isPropertyName(node: TypeScript.Identifier): boolean {
  const parent = node.parent
  return TypeScript.isPropertyAccessExpression(parent) && parent.name === node
    || TypeScript.isQualifiedName(parent) && parent.right === node
    || TypeScript.isImportSpecifier(parent) || TypeScript.isExportSpecifier(parent)
    || TypeScript.isPropertyAssignment(parent) && parent.name === node
    || TypeScript.isPropertySignature(parent) && parent.name === node
    || TypeScript.isPropertyDeclaration(parent) && parent.name === node
    || TypeScript.isMethodDeclaration(parent) && parent.name === node
    || TypeScript.isBindingElement(parent) && parent.propertyName === node
}

function isGlobalThisAccess(node: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression): boolean {
  return TypeScript.isIdentifier(node.expression) && node.expression.text === 'globalThis'
}

function isLocalValue(node: TypeScript.Node, checker?: TypeScript.TypeChecker): boolean {
  if (TypeScript.isPropertyAccessExpression(node) || TypeScript.isElementAccessExpression(node)) {
    return isLocalValue(node.expression, checker)
  }
  if (!TypeScript.isIdentifier(node)) {
    return false
  }
  const symbol = TypeScript.isShorthandPropertyAssignment(node.parent)
    ? checker?.getShorthandAssignmentValueSymbol(node.parent)
    : checker?.getSymbolAtLocation(node)
  return symbol?.declarations?.some(declaration => declaration.getSourceFile() === node.getSourceFile()) ?? false
}

function isBrowserExecutionCallback(node: TypeScript.Node, checker?: TypeScript.TypeChecker): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!TypeScript.isArrowFunction(parent) && !TypeScript.isFunctionExpression(parent)) {
      continue
    }
    const call = parent.parent
    if (!TypeScript.isCallExpression(call) || call.arguments[0] !== parent) {
      continue
    }
    if (
      !TypeScript.isPropertyAccessExpression(call.expression) || !browserExecutionMethods.has(call.expression.name.text)
    ) {
      continue
    }
    const declaration = checker?.getResolvedSignature(call)?.declaration
    const filename = declaration?.getSourceFile().fileName.replaceAll('\\', '/')
    return filename?.includes('/node_modules/playwright-core/') === true
  }
  return false
}

// These callbacks execute in the remote browser rather than the importing host module.
const browserExecutionMethods = new Set([
  'evaluate',
  'evaluateAll',
  'evaluateHandle',
  'waitForFunction',
  'addInitScript',
])

function isUniversalTimeAccess(node: TypeScript.Node, filename: string): boolean {
  const normalizedFilename = filename.replaceAll('\\', '/')
  if (normalizedFilename !== 'ts/shared/shared-src/universal/Time.ts') {
    return false
  }
  if (TypeScript.isIdentifier(node)) {
    return ['performance', 'setTimeout', 'clearTimeout', 'queueMicrotask'].includes(node.text)
      || node.text === 'Date' && isWallClockAccess(node)
  }
  return false
}

function isWallClockAccess(node: TypeScript.Identifier): boolean {
  const parent = node.parent
  if (
    (TypeScript.isPropertyAccessExpression(parent) || TypeScript.isElementAccessExpression(parent))
    && parent.expression === node
  ) {
    return accessedMemberName(parent) === 'now'
  }
  if (TypeScript.isNewExpression(parent) && parent.expression === node) {
    return (parent.arguments?.length ?? 0) === 0
  }
  return TypeScript.isCallExpression(parent) && parent.expression === node && parent.arguments.length === 0
}
