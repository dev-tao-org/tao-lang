import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { isRuntimeFunctionNode } from './source-conformance-functions'

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

/** selectedFunctionCallIssue requires a named callable before invoking a fallback or conditional selection. */
export function selectedFunctionCallIssue(node: TypeScript.Node): string | undefined {
  if (!TypeScript.isCallExpression(node)) {
    return undefined
  }
  const callee = unwrapCallee(node.expression)
  if (TypeScript.isConditionalExpression(callee) || isFallbackSelection(callee)) {
    return 'select the callable in a named constant before invoking it'
  }
}

type CalleeWrapper =
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.TypeAssertion
  | TypeScript.NonNullExpression
  | TypeScript.SatisfiesExpression

function unwrapCallee(expression: TypeScript.Expression): TypeScript.Expression {
  let current = expression
  while (isCalleeWrapper(current)) {
    current = current.expression
  }
  return current
}

function isCalleeWrapper(node: TypeScript.Expression): node is CalleeWrapper {
  if (TypeScript.isParenthesizedExpression(node) || TypeScript.isAsExpression(node)) {
    return true
  }
  return TypeScript.isTypeAssertionExpression(node) || TypeScript.isNonNullExpression(node)
    || TypeScript.isSatisfiesExpression(node)
}

function isFallbackSelection(node: TypeScript.Expression): boolean {
  return TypeScript.isBinaryExpression(node)
    && (node.operatorToken.kind === TypeScript.SyntaxKind.QuestionQuestionToken
      || node.operatorToken.kind === TypeScript.SyntaxKind.BarBarToken)
}

function isFunctionBoundary(node: TypeScript.Node): boolean {
  return isRuntimeFunctionNode(node)
}
