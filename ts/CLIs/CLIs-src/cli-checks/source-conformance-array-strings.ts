import { NewlineCharacter } from '@shared'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** arrayMultilineStringIssue requires newline-joined array literals to use the shared line helper. */
export function arrayMultilineStringIssue(node: TypeScript.Node): string | undefined {
  if (!TypeScript.isCallExpression(node) || !isNewlineJoin(node)) {
    return undefined
  }
  const receiver = unwrapArrayReceiver(node.expression.expression)
  return TypeScript.isArrayLiteralExpression(receiver)
    ? 'use S for authored multiline strings or joinTextLines from @shared for dynamic lines'
    : undefined
}

type ArrayReceiverWrapper =
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.TypeAssertion
  | TypeScript.NonNullExpression
  | TypeScript.SatisfiesExpression

type JoinAccess = TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression

type JoinCall = TypeScript.CallExpression & { expression: JoinAccess }

function isNewlineJoin(node: TypeScript.CallExpression): node is JoinCall {
  if (!isJoinAccess(node.expression)) {
    return false
  }
  const [separator] = node.arguments
  return node.arguments.length === 1 && TypeScript.isStringLiteralLike(separator) && separator.text === NewlineCharacter
}

function isJoinAccess(expression: TypeScript.Expression): expression is JoinAccess {
  if (TypeScript.isPropertyAccessExpression(expression)) {
    return expression.name.text === 'join'
  }
  if (!TypeScript.isElementAccessExpression(expression)) {
    return false
  }
  const propertyName = expression.argumentExpression
  if (!propertyName || !TypeScript.isStringLiteralLike(propertyName)) {
    return false
  }
  return propertyName.text === 'join'
}

function unwrapArrayReceiver(expression: TypeScript.Expression): TypeScript.Expression {
  let receiver = expression
  while (isArrayReceiverWrapper(receiver)) {
    receiver = receiver.expression
  }
  return receiver
}

function isArrayReceiverWrapper(expression: TypeScript.Expression): expression is ArrayReceiverWrapper {
  return isParenthesizedOrAsExpression(expression) || isTypeAssertionOrNonNullExpression(expression)
    || TypeScript.isSatisfiesExpression(expression)
}

type ParenthesizedOrAsExpression = TypeScript.ParenthesizedExpression | TypeScript.AsExpression

function isParenthesizedOrAsExpression(expression: TypeScript.Expression): expression is ParenthesizedOrAsExpression {
  return TypeScript.isParenthesizedExpression(expression) || TypeScript.isAsExpression(expression)
}

type TypeAssertionOrNonNullExpression = TypeScript.TypeAssertion | TypeScript.NonNullExpression

function isTypeAssertionOrNonNullExpression(
  expression: TypeScript.Expression,
): expression is TypeAssertionOrNonNullExpression {
  return TypeScript.isTypeAssertionExpression(expression) || TypeScript.isNonNullExpression(expression)
}
