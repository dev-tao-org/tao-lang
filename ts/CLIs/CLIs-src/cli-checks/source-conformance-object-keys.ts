import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** objectLiteralKeysIssue requires string keys to be quoted consistently within an object literal. */
export function objectLiteralKeysIssue(node: TypeScript.Node): string | undefined {
  if (!TypeScript.isObjectLiteralExpression(node)) {
    return undefined
  }
  const hasQuotedKey = node.properties.some(property => isStringKey(property.name))
  return hasQuotedKey && node.properties.some(property => isIdentifierKey(property.name))
    ? 'quote every string property name when any string property name is quoted'
    : undefined
}

/** objectCopyIssue requires the shared shallow-copy helper for spread-only object literals. */
export function objectCopyIssue(node: TypeScript.Node, filename: string): string | undefined {
  if (!TypeScript.isObjectLiteralExpression(node)) {
    return undefined
  }
  const isSingleSpread = node.properties.length === 1 && TypeScript.isSpreadAssignment(node.properties[0])
  if (!isSingleSpread || isObjectsCopyImplementation(node, filename)) {
    return undefined
  }
  return 'use Objects.copy(source) for shallow object copies'
}

/** getQuotedObjectKeyChanges quotes eligible string keys in consistently quoted object literals. */
export function getQuotedObjectKeyChanges(file: TypeScript.SourceFile): TypeScript.TextChange[] {
  const changes: TypeScript.TextChange[] = []
  const visit = (node: TypeScript.Node): void => {
    if (TypeScript.isObjectLiteralExpression(node)) {
      changes.push(...objectLiteralKeyChanges(node, file))
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return changes
}

function objectLiteralKeyChanges(
  node: TypeScript.ObjectLiteralExpression,
  file: TypeScript.SourceFile,
): TypeScript.TextChange[] {
  if (!objectLiteralKeysIssue(node) || hasUnfixableShorthand(node)) {
    return []
  }
  return node.properties.flatMap(property => {
    if (TypeScript.isShorthandPropertyAssignment(property)) {
      return [quotePropertyName(property.name, file, shorthandPropertyReplacement(property.name.text))]
    }
    return isIdentifierKey(property.name)
      ? [quotePropertyName(property.name, file, quote(property.name.text))]
      : []
  })
}

function shorthandPropertyReplacement(key: string): string {
  return key === '__proto__' ? "['__proto__']: __proto__" : `${quote(key)}: ${key}`
}

function quotePropertyName(
  name: TypeScript.Identifier,
  file: TypeScript.SourceFile,
  replacement: string,
): TypeScript.TextChange {
  return {
    span: { start: name.getStart(file), length: name.getWidth(file) },
    newText: replacement,
  }
}

function hasUnfixableShorthand(node: TypeScript.ObjectLiteralExpression): boolean {
  return node.properties.some(property =>
    TypeScript.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer !== undefined
  )
}

type OptionalPropertyName = TypeScript.PropertyName | undefined

function isStringKey(name: OptionalPropertyName): name is TypeScript.StringLiteral {
  return name !== undefined && TypeScript.isStringLiteral(name)
}

function isIdentifierKey(name: OptionalPropertyName): name is TypeScript.Identifier {
  return name !== undefined && TypeScript.isIdentifier(name)
}

function isObjectsCopyImplementation(node: TypeScript.ObjectLiteralExpression, filename: string): boolean {
  const returnStatement = node.parent
  if (!filename.endsWith('/universal/Objects.ts') || !TypeScript.isReturnStatement(returnStatement)) {
    return false
  }
  const functionDeclaration = returnStatement.parent.parent
  return TypeScript.isFunctionDeclaration(functionDeclaration)
    && functionDeclaration.name?.text === 'copy'
}

function quote(key: string): string {
  return `'${key}'`
}
