import * as TypeScript from 'typescript'

/** optionalAccessIssue reports ternary member reads whose truthiness check is equivalent to a nullish check. */
export function optionalAccessIssue(node: TypeScript.Node, checker: TypeScript.TypeChecker): string | undefined {
  if (!TypeScript.isConditionalExpression(node)) {
    return undefined
  }
  const condition = unwrap(node.condition)
  const absent = unwrap(node.whenFalse)
  if (!TypeScript.isIdentifier(condition) || !isUndefinedIdentifier(absent)) {
    return undefined
  }
  const value = unwrap(node.whenTrue)
  if (!isMemberRead(value) || !isSameIdentifier(value.expression, condition)) {
    return undefined
  }
  const type = checker.getTypeAtLocation(condition)
  const members = type.isUnion() ? type.types : [type]
  const nullish = TypeScript.TypeFlags.Null | TypeScript.TypeFlags.Undefined
  if (!members.some(member => (member.flags & nullish) !== 0) || !members.every(isNullishOrTruthy)) {
    return undefined
  }
  if ((checker.getTypeAtLocation(absent).flags & TypeScript.TypeFlags.Undefined) === 0) {
    return undefined
  }
  return 'prefer optional access over a nullish-only ternary member read; include undefined in any result assertion'
}

function isUndefinedIdentifier(expression: TypeScript.Expression): boolean {
  return TypeScript.isIdentifier(expression) && expression.text === 'undefined'
}

function isNullishOrTruthy(type: TypeScript.Type): boolean {
  const flags = TypeScript.TypeFlags
  if ((type.flags & (flags.Null | flags.Undefined | flags.Object | flags.NonPrimitive | flags.ESSymbolLike)) !== 0) {
    return true
  }
  if (type.isStringLiteral()) {
    return type.value !== ''
  }
  if (type.isNumberLiteral()) {
    return type.value !== 0
  }
  return false
}

function isMemberRead(node: TypeScript.Expression): node is
  | TypeScript.PropertyAccessExpression
  | TypeScript.ElementAccessExpression
{
  return TypeScript.isPropertyAccessExpression(node) || TypeScript.isElementAccessExpression(node)
}

function isSameIdentifier(expression: TypeScript.Expression, condition: TypeScript.Identifier): boolean {
  const base = unwrap(expression)
  return TypeScript.isIdentifier(base) && base.text === condition.text
}

function unwrap(expression: TypeScript.Expression): TypeScript.Expression {
  let current = expression
  while (TypeScript.isParenthesizedExpression(current) || TypeScript.isAsExpression(current)) {
    current = current.expression
  }
  return current
}
