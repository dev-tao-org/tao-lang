import { TypeScript } from '@tao/shared/typescript'

export { argumentsIdentifierIssue, booleanExpressionIssue, namedRegexIssue, unnamedUnionIssue }

const MaximumBooleanOperators = 2
const AbsenceTypeNames = new Set(['Missing', 'None'])
const AsyncReturnTypeNames = new Set(['Promise', 'PromiseLike'])
type TransparentExpression =
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.TypeAssertion
  | TypeScript.NonNullExpression
  | TypeScript.SatisfiesExpression

/** argumentsIdentifierIssue replaces local and parameter bindings with the concise args name. */
function argumentsIdentifierIssue(node: TypeScript.Node): string | undefined {
  if (!TypeScript.isIdentifier(node) || node.text !== 'arguments_') {
    return undefined
  }
  const declaration = node.parent
  if (TypeScript.isVariableDeclaration(declaration) || TypeScript.isParameter(declaration)) {
    return declaration.name === node
      ? 'name argument-array bindings args instead of arguments_'
      : undefined
  }
  if (TypeScript.isBindingElement(declaration)) {
    return declaration.name === node ? 'name argument-array bindings args instead of arguments_' : undefined
  }
  return undefined
}

/** booleanExpressionIssue limits connected logical expressions while keeping evaluation boundaries separate. */
function booleanExpressionIssue(node: TypeScript.Node): string | undefined {
  if (!isLogicalBinary(node) || hasLogicalParent(node)) {
    return undefined
  }
  if (countLogicalOperators(node) > MaximumBooleanOperators) {
    return 'boolean expressions need at most two &&/|| operators; extract meaningful named predicates or values preserving short circuiting and narrowing'
  }
}

/** unnamedUnionIssue requires domain aliases except simple absence unions in return annotations. */
function unnamedUnionIssue(node: TypeScript.Node): string | undefined {
  if (!TypeScript.isUnionTypeNode(node) || isNamedUnion(node) || isOptionalReturnUnion(node)) {
    return undefined
  }
  return 'union types need a purpose-named domain alias; only return X | Missing/None/absence may remain inline'
}

/** namedRegexIssue requires regular expression literals and constructor calls to initialize named constants. */
function namedRegexIssue(node: TypeScript.Node): string | undefined {
  if (!isRegexCreation(node)) {
    return undefined
  }
  const declaration = unwrapExpressionParent(node).parent
  if (isNamedConstInitializer(declaration, node)) {
    return undefined
  }
  return 'regular expression literals and constructors must initialize a named const; share definitions and helpers through Regxs where @shared is usable'
}

function isRegexCreation(node: TypeScript.Node): boolean {
  if (node.kind === TypeScript.SyntaxKind.RegularExpressionLiteral) {
    return true
  }
  if (!TypeScript.isNewExpression(node) && !TypeScript.isCallExpression(node)) {
    return false
  }
  return isRegexConstructor(node.expression)
}

function isRegexConstructor(node: TypeScript.Expression): boolean {
  if (isTransparentExpression(node)) {
    return isRegexConstructor(node.expression)
  }
  if (TypeScript.isIdentifier(node)) {
    return node.text === 'RegExp'
  }
  if (TypeScript.isPropertyAccessExpression(node) && node.name.text === 'RegExp') {
    return TypeScript.isIdentifier(node.expression) && node.expression.text === 'globalThis'
  }
  return false
}

function isLogicalBinary(node: TypeScript.Node): node is TypeScript.BinaryExpression {
  return TypeScript.isBinaryExpression(node)
    && (node.operatorToken.kind === TypeScript.SyntaxKind.AmpersandAmpersandToken
      || node.operatorToken.kind === TypeScript.SyntaxKind.BarBarToken)
}

function hasLogicalParent(node: TypeScript.Node): boolean {
  return isLogicalBinary(unwrapExpressionParent(node).parent)
}

function unwrapExpressionParent(node: TypeScript.Node): TypeScript.Node {
  let current = node
  while (isBooleanWrapper(current.parent)) {
    current = current.parent
  }
  return current
}

function isBooleanWrapper(node: TypeScript.Node): boolean {
  return isTransparentExpression(node)
    || (TypeScript.isPrefixUnaryExpression(node) && node.operator === TypeScript.SyntaxKind.ExclamationToken)
}

function isTransparentExpression(node: TypeScript.Node): node is TransparentExpression {
  if (TypeScript.isParenthesizedExpression(node) || TypeScript.isAsExpression(node)) {
    return true
  }
  return TypeScript.isTypeAssertionExpression(node) || TypeScript.isNonNullExpression(node)
    || TypeScript.isSatisfiesExpression(node)
}

function countLogicalOperators(node: TypeScript.Node): number {
  if (isTransparentExpression(node)) {
    return countLogicalOperators(node.expression)
  }
  if (TypeScript.isPrefixUnaryExpression(node) && node.operator === TypeScript.SyntaxKind.ExclamationToken) {
    return countLogicalOperators(node.operand)
  }
  if (!isLogicalBinary(node)) {
    return 0
  }
  return 1 + countLogicalOperators(node.left) + countLogicalOperators(node.right)
}

function isNamedUnion(node: TypeScript.UnionTypeNode): boolean {
  const root = unwrapTypeParent(node)
  return TypeScript.isTypeAliasDeclaration(root.parent) && root.parent.type === root
}

function unwrapTypeParent(node: TypeScript.TypeNode): TypeScript.TypeNode {
  let current = node
  while (TypeScript.isParenthesizedTypeNode(current.parent)) {
    current = current.parent
  }
  return current
}

function isOptionalReturnUnion(node: TypeScript.UnionTypeNode): boolean {
  const presentTypes = node.types.filter(type => !isAbsenceType(type))
  if (presentTypes.length !== 1 || presentTypes.length === node.types.length) {
    return false
  }
  let root = unwrapTypeParent(node)
  if (isAsyncReturnWrapper(root.parent)) {
    root = unwrapTypeParent(root.parent)
  }
  return TypeScript.isFunctionLike(root.parent) && root.parent.type === root
}

function isAbsenceType(node: TypeScript.TypeNode): boolean {
  if (TypeScript.isParenthesizedTypeNode(node)) {
    return isAbsenceType(node.type)
  }
  if (node.kind === TypeScript.SyntaxKind.UndefinedKeyword || node.kind === TypeScript.SyntaxKind.VoidKeyword) {
    return true
  }
  if (TypeScript.isLiteralTypeNode(node) && node.literal.kind === TypeScript.SyntaxKind.NullKeyword) {
    return true
  }
  return TypeScript.isTypeReferenceNode(node) && AbsenceTypeNames.has(node.typeName.getText())
}

function isAsyncReturnWrapper(node: TypeScript.Node): node is TypeScript.TypeReferenceNode {
  return TypeScript.isTypeReferenceNode(node) && node.typeArguments?.length === 1
    && AsyncReturnTypeNames.has(node.typeName.getText())
}

function isNamedConstInitializer(node: TypeScript.Node, literal: TypeScript.Node): boolean {
  if (!TypeScript.isVariableDeclaration(node) || !TypeScript.isIdentifier(node.name)) {
    return false
  }
  if (!node.initializer || !TypeScript.isVariableDeclarationList(node.parent)) {
    return false
  }
  return unwrapRegexInitializer(node.initializer) === literal
    && (node.parent.flags & TypeScript.NodeFlags.Const) !== 0
}

function unwrapRegexInitializer(node: TypeScript.Expression): TypeScript.Expression {
  let current = node
  while (isTransparentExpression(current)) {
    current = current.expression
  }
  return current
}
