import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** nestedConditionalIssue reports ternary expressions nested in the same runtime expression. */
export function nestedConditionalIssue(node: TypeScript.Node): string | undefined {
  if (!TypeScript.isConditionalExpression(node)) {
    return undefined
  }
  let ancestor = node.parent
  while (ancestor && !isFunctionBoundary(ancestor)) {
    if (TypeScript.isConditionalExpression(ancestor)) {
      return 'nested ternary expressions must use a named function with explicit conditions and returns'
    }
    ancestor = ancestor.parent
  }
}

function isFunctionBoundary(node: TypeScript.Node): boolean {
  return TypeScript.isFunctionDeclaration(node) || TypeScript.isFunctionExpression(node)
    || TypeScript.isArrowFunction(node) || TypeScript.isMethodDeclaration(node)
    || TypeScript.isGetAccessorDeclaration(node) || TypeScript.isSetAccessorDeclaration(node)
    || TypeScript.isConstructorDeclaration(node)
}
