import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** predicateOperatorIssue confines runtime identity and property-presence checks to named predicates. */
export function predicateOperatorIssue(node: TypeScript.Node): string | undefined {
  if (!isPredicateOperator(node)) {
    return undefined
  }
  const owner = findContainingFunction(node)
  return owner && isNamedPredicate(owner)
    ? undefined
    : 'put runtime instanceof and in checks in a named predicate with an explicit boolean or type-guard return type'
}

function isPredicateOperator(node: TypeScript.Node): boolean {
  if (!TypeScript.isBinaryExpression(node)) {
    return false
  }
  return node.operatorToken.kind === TypeScript.SyntaxKind.InKeyword
    || node.operatorToken.kind === TypeScript.SyntaxKind.InstanceOfKeyword
}

function findContainingFunction(node: TypeScript.Node): TypeScript.SignatureDeclaration | undefined {
  let current = node.parent
  while (current) {
    if (TypeScript.isFunctionLike(current)) {
      return current
    }
    if (TypeScript.isClassDeclaration(current) || TypeScript.isClassExpression(current)) {
      return undefined
    }
    current = current.parent
  }
  return undefined
}

function isNamedPredicate(owner: TypeScript.SignatureDeclaration): boolean {
  if (!owner.type || !isPredicateReturnType(owner.type)) {
    return false
  }
  if (owner.name && isStaticName(owner.name)) {
    return true
  }
  if (TypeScript.isArrowFunction(owner) || TypeScript.isFunctionExpression(owner)) {
    return hasNamedBinding(owner)
  }
  return false
}

function isPredicateReturnType(node: TypeScript.TypeNode): boolean {
  return node.kind === TypeScript.SyntaxKind.BooleanKeyword || TypeScript.isTypePredicateNode(node)
}

type BoundCallable = TypeScript.ArrowFunction | TypeScript.FunctionExpression

function hasNamedBinding(owner: BoundCallable): boolean {
  let expression: TypeScript.Node = owner
  while (isBindingWrapper(expression.parent)) {
    expression = expression.parent
  }
  const binding = expression.parent
  if (TypeScript.isVariableDeclaration(binding) || TypeScript.isPropertyDeclaration(binding)) {
    return isStaticName(binding.name)
  }
  return TypeScript.isPropertyAssignment(binding) && isStaticName(binding.name)
}

type BindingWrapper = TypeScript.ParenthesizedExpression | TypeScript.AsExpression | TypeScript.SatisfiesExpression

function isBindingWrapper(node: TypeScript.Node): node is BindingWrapper {
  return TypeScript.isParenthesizedExpression(node) || TypeScript.isAsExpression(node)
    || TypeScript.isSatisfiesExpression(node)
}

type StaticName = TypeScript.Identifier | TypeScript.StringLiteral | TypeScript.NumericLiteral

function isStaticName(node: TypeScript.Node): node is StaticName {
  return TypeScript.isIdentifier(node) || TypeScript.isStringLiteral(node) || TypeScript.isNumericLiteral(node)
}
