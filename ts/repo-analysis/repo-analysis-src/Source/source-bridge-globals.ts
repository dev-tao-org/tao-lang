import { TypeScript } from '@tao/shared/typescript'
import { isExcludedSource } from './source-size'

/** platformGlobalIssue keeps host globals within their platform bridge owner. */
export function platformGlobalIssue(
  node: TypeScript.Node,
  filename: string,
  checker?: TypeScript.TypeChecker,
  excludedSource = isExcludedSource(filename, node.getSourceFile().text),
): string | undefined {
  if (isOwnedEnvironmentReference(node, filename)) {
    return
  }
  if (!isEnvironmentOwner(filename) && isProcessEnvironmentAccess(node)) {
    return 'process environment access belongs in Env; use readonly values or subprocess addEnv overrides'
  }
  if (shouldSkipPlatformReference(node, filename, checker, excludedSource)) {
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

type MemberAccess = TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression
type OptionalTypeChecker = TypeScript.TypeChecker | undefined
type OptionalMemberName = string | undefined

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

function shouldSkipPlatformReference(
  node: TypeScript.Node,
  filename: string,
  checker: OptionalTypeChecker,
  excluded: boolean,
): boolean {
  return excluded || isUniversalTimeAccess(node, filename) || isBrowserExecutionCallback(node, checker)
}

function getGlobalOwnerPath(name: string): string | undefined {
  if (name === 'process') {
    return 'ts/shared/shared-src/os/Process/Process-Current.ts'
  }
  if (name === 'Buffer') {
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
  if (isRegisteredGlobalIdentifier(node)) {
    if (node.text !== 'Date' || isWallClockAccess(node)) {
      return node.text
    }
  }
  if (TypeScript.isPropertyAccessExpression(node) || TypeScript.isElementAccessExpression(node)) {
    const member = accessedMemberName(node)
    if (isRegisteredGlobalMember(node, member)) {
      return member !== 'Date' || isWallClockAccess(node) ? member : undefined
    }
  }
}

function isRegisteredGlobalIdentifier(node: TypeScript.Node): node is TypeScript.Identifier {
  return TypeScript.isIdentifier(node) && platformGlobals.has(node.text) && !isPropertyName(node)
}

function isRegisteredGlobalMember(
  node: MemberAccess,
  member: OptionalMemberName,
): member is string {
  return member !== undefined && platformGlobals.has(member) && isGlobalThisAccess(node)
}

function accessedMemberName(node: MemberAccess): string | undefined {
  if (TypeScript.isPropertyAccessExpression(node)) {
    return node.name.text
  }
  return TypeScript.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined
}

function isPropertyName(node: TypeScript.Identifier): boolean {
  const parent = node.parent
  if (TypeScript.isPropertyAccessExpression(parent) || TypeScript.isQualifiedName(parent)) {
    return (TypeScript.isPropertyAccessExpression(parent) ? parent.name : parent.right) === node
  }
  if (TypeScript.isImportSpecifier(parent) || TypeScript.isExportSpecifier(parent)) {
    return true
  }
  if (TypeScript.isBindingElement(parent)) {
    return parent.propertyName === node
  }
  return hasPropertyName(parent) && parent.name === node
}

type NamedProperty =
  | TypeScript.PropertyAssignment
  | TypeScript.PropertySignature
  | TypeScript.PropertyDeclaration
  | TypeScript.MethodDeclaration
function hasPropertyName(node: TypeScript.Node): node is NamedProperty {
  const property = TypeScript.isPropertyAssignment(node) || TypeScript.isPropertySignature(node)
  const declaration = TypeScript.isPropertyDeclaration(node) || TypeScript.isMethodDeclaration(node)
  return property || declaration
}

function isGlobalThisAccess(node: MemberAccess): boolean {
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

function isWallClockAccess(node: TypeScript.Expression): boolean {
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

function isProcessEnvironmentAccess(node: TypeScript.Node): boolean {
  if (!TypeScript.isPropertyAccessExpression(node) && !TypeScript.isElementAccessExpression(node)) {
    return false
  }
  if (accessedMemberName(node) !== 'env') {
    return false
  }
  const receiver = node.expression
  if (TypeScript.isIdentifier(receiver)) {
    return receiver.text === 'process' || receiver.text === 'hostProcess'
  }
  if (!TypeScript.isPropertyAccessExpression(receiver) || receiver.name.text !== 'process') {
    return false
  }
  return TypeScript.isIdentifier(receiver.expression) && receiver.expression.text === 'globalThis'
}

function isOwnedEnvironmentReference(node: TypeScript.Node, filename: string): boolean {
  if (filename.replaceAll('\\\\', '/') !== 'ts/shared/shared-src/os/Env.ts') {
    return false
  }
  for (const candidate of [node, node.parent, node.parent?.parent]) {
    if (candidate !== undefined && isProcessEnvironmentAccess(candidate)) {
      return true
    }
  }
  return false
}

function isEnvironmentOwner(filename: string): boolean {
  return filename === 'ts/shared/shared-src/os/Env.ts'
    || filename === 'ts/shared/shared-src/os/Process/Process-Current.ts'
}
