import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** concreteReturnTypeIssue rejects concrete uses of the built-in ReturnType utility. */
export function concreteReturnTypeIssue(node: TypeScript.Node, checker: TypeScript.TypeChecker): string | undefined {
  if (
    !TypeScript.isTypeReferenceNode(node) || !isReturnTypeReference(node)
  ) {
    return undefined
  }
  const symbol = checker.getSymbolAtLocation(node.typeName)
  if (!isDefaultLibraryReturnType(symbol)) {
    return undefined
  }
  const argument = node.typeArguments?.[0]
  if (!argument) {
    return undefined
  }
  return resolvesToTypeParameter(argument, checker)
    ? undefined
    : 'name the semantic return type instead of using ReturnType on a concrete type'
}

function isReturnTypeReference(node: TypeScript.TypeReferenceNode): boolean {
  if (!TypeScript.isIdentifier(node.typeName)) {
    return false
  }
  return node.typeName.text === 'ReturnType' && node.typeArguments?.length === 1
}

/** ownLineNullishIssue detects a nullish coalescing operator on a new line. */
export function ownLineNullishIssue(node: TypeScript.Node, file: TypeScript.SourceFile): string | undefined {
  if (!TypeScript.isBinaryExpression(node) || node.operatorToken.kind !== TypeScript.SyntaxKind.QuestionQuestionToken) {
    return undefined
  }
  const operatorLine = file.getLineAndCharacterOfPosition(node.operatorToken.getStart(file)).line
  const leftEndLine = file.getLineAndCharacterOfPosition(node.left.getEnd() - 1).line
  return operatorLine > leftEndLine
    ? 'replace a separately indented ?? fallback with an explicit guard or a named decision function'
    : undefined
}

type OptionalTypeScriptSymbol = TypeScript.Symbol | undefined

function isDefaultLibraryReturnType(symbol: OptionalTypeScriptSymbol): boolean {
  return symbol?.getDeclarations()?.some(declaration => {
    const file = declaration.getSourceFile()
    return file.hasNoDefaultLib && TypeScript.isTypeAliasDeclaration(declaration)
      && declaration.name.text === 'ReturnType'
  }) === true
}

function resolvesToTypeParameter(node: TypeScript.TypeNode, checker: TypeScript.TypeChecker): boolean {
  return (checker.getTypeFromTypeNode(node).flags & TypeScript.TypeFlags.TypeParameter) !== 0
}
