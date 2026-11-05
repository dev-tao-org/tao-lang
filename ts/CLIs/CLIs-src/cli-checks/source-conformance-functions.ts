import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

export { isRuntimeFunctionNode, objectFunctionStyleIssue }

const inlineIssue = 'single-return object functions should use expression-bodied arrow properties'

type ObjectFunction = TypeScript.MethodDeclaration | TypeScript.ArrowFunction | TypeScript.FunctionExpression
type ExpressionWrapper =
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.NonNullExpression

/** isRuntimeFunctionNode identifies function declarations which can own executable bodies. */
function isRuntimeFunctionNode(node: TypeScript.Node): node is TypeScript.FunctionLikeDeclaration {
  if (
    TypeScript.isFunctionDeclaration(node) || TypeScript.isFunctionExpression(node) || TypeScript.isArrowFunction(node)
  ) {
    return true
  }
  if (TypeScript.isMethodDeclaration(node) || TypeScript.isConstructorDeclaration(node)) {
    return true
  }
  return TypeScript.isGetAccessorDeclaration(node) || TypeScript.isSetAccessorDeclaration(node)
}

const methodIssue = 'multi-statement object functions must use method syntax'
/** objectFunctionStyleIssue reports safe object-function style changes. */
function objectFunctionStyleIssue(node: TypeScript.Node, source: string): string | undefined {
  if (TypeScript.isMethodDeclaration(node) && TypeScript.isObjectLiteralExpression(node.parent)) {
    return canUseInlineArrow(node, source) ? inlineIssue : undefined
  }
  if (!TypeScript.isPropertyAssignment(node) || !TypeScript.isObjectLiteralExpression(node.parent)) {
    return undefined
  }
  const value = unwrapExpression(node.initializer)
  if (TypeScript.isArrowFunction(value)) {
    if (!TypeScript.isBlock(value.body)) {
      return undefined
    }
    if (isSingleReturnValue(value)) {
      return hasReturnComments(value, source) ? undefined : inlineIssue
    }
    return isBindingSafe(value) ? methodIssue : undefined
  }
  if (TypeScript.isFunctionExpression(value) && !value.name && isBindingSafe(value)) {
    if (!isSingleReturnValue(value)) {
      return methodIssue
    }
    if (hasReturnComments(value, source)) {
      return undefined
    }
    return inlineIssue
  }
  return undefined
}

function canUseInlineArrow(node: ObjectFunction, source: string): boolean {
  return isSingleReturnValue(node) && isBindingSafe(node) && !hasReturnComments(node, source)
}

function isSingleReturnValue(node: ObjectFunction): boolean {
  const body = node.body
  if (!body || !TypeScript.isBlock(body) || isGenerator(node)) {
    return false
  }
  if (body.statements.length !== 1) {
    return false
  }
  const statement = body.statements[0]
  return TypeScript.isReturnStatement(statement) && statement.expression !== undefined
}

function hasReturnComments(node: ObjectFunction, source: string): boolean {
  const body = node.body
  if (!body || !TypeScript.isBlock(body) || !TypeScript.isReturnStatement(body.statements[0])) {
    return false
  }
  const statement = body.statements[0]
  const expression = statement.expression
  if (!expression) {
    return false
  }
  const hasStatementComments = hasLeadingComment(source, statement.getFullStart())
    || hasLeadingComment(source, expression.getFullStart())
  return hasStatementComments || hasLeadingComment(source, body.getFullStart())
    || (TypeScript.getTrailingCommentRanges(source, expression.end)?.length ?? 0) > 0
}

function hasLeadingComment(source: string, position: number): boolean {
  return (TypeScript.getLeadingCommentRanges(source, position)?.length ?? 0) > 0
}

function isGenerator(node: ObjectFunction): boolean {
  return (TypeScript.isMethodDeclaration(node) || TypeScript.isFunctionExpression(node))
    && node.asteriskToken !== undefined
}

function isBindingSafe(root: ObjectFunction): boolean {
  if (root.parameters.some(parameter => TypeScript.isIdentifier(parameter.name) && parameter.name.text === 'this')) {
    return false
  }
  let safe = true
  const visit = (node: TypeScript.Node): void => {
    if (node !== root && isNonArrowFunction(node)) {
      if (TypeScript.isMethodDeclaration(node) && TypeScript.isComputedPropertyName(node.name)) {
        visit(node.name.expression)
      }
      return
    }
    if (hasSensitiveBinding(node)) {
      safe = false
      return
    }
    node.forEachChild(visit)
  }
  visit(root)
  return safe
}

function hasSensitiveBinding(node: TypeScript.Node): boolean {
  if (node.kind === TypeScript.SyntaxKind.ThisKeyword || node.kind === TypeScript.SyntaxKind.SuperKeyword) {
    return true
  }
  if (TypeScript.isIdentifier(node) && node.text === 'arguments') {
    return true
  }
  return TypeScript.isMetaProperty(node) && node.keywordToken === TypeScript.SyntaxKind.NewKeyword
}

type NonArrowFunction = TypeScript.FunctionDeclaration | TypeScript.FunctionExpression | TypeScript.MethodDeclaration

function isNonArrowFunction(node: TypeScript.Node): node is NonArrowFunction {
  return TypeScript.isFunctionDeclaration(node) || TypeScript.isFunctionExpression(node)
    || TypeScript.isMethodDeclaration(node)
}

function unwrapExpression(expression: TypeScript.Expression): TypeScript.Expression {
  let current = expression
  while (isExpressionWrapper(current)) {
    current = current.expression
  }
  return current
}

function isExpressionWrapper(node: TypeScript.Expression): node is ExpressionWrapper {
  if (TypeScript.isParenthesizedExpression(node) || TypeScript.isAsExpression(node)) {
    return true
  }
  return TypeScript.isSatisfiesExpression(node) || TypeScript.isNonNullExpression(node)
}
