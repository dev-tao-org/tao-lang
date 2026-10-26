import * as TypeScript from 'typescript'

export { objectFunctionStyleIssue }

const inlineIssue = 'single-return object functions should use expression-bodied arrow properties'
const methodIssue = 'multi-statement object functions must use method syntax'
type ObjectFunction = TypeScript.MethodDeclaration | TypeScript.ArrowFunction | TypeScript.FunctionExpression

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
  if (!body || !TypeScript.isBlock(body) || isGenerator(node) || body.statements.length !== 1) {
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
  return hasLeadingComment(source, statement.getFullStart()) || hasLeadingComment(source, expression.getFullStart())
    || hasLeadingComment(source, body.getFullStart())
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
  return node.kind === TypeScript.SyntaxKind.ThisKeyword || node.kind === TypeScript.SyntaxKind.SuperKeyword
    || (TypeScript.isIdentifier(node) && node.text === 'arguments')
    || (TypeScript.isMetaProperty(node) && node.keywordToken === TypeScript.SyntaxKind.NewKeyword)
}

function isNonArrowFunction(node: TypeScript.Node): boolean {
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

function isExpressionWrapper(node: TypeScript.Expression): node is
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.NonNullExpression
{
  return TypeScript.isParenthesizedExpression(node) || TypeScript.isAsExpression(node)
    || TypeScript.isSatisfiesExpression(node) || TypeScript.isNonNullExpression(node)
}
