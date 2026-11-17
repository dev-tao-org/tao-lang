import { TypeScript } from '@tao/shared/typescript'

const NativeJsonOwner = 'ts/shared/shared-src/universal/Json/Native.ts'

/** rawJsonIssue keeps native JSON access in the shared serialization boundary. */
export function rawJsonIssue(
  node: TypeScript.Node,
  filename: string,
  checker: TypeScript.TypeChecker,
): string | undefined {
  if (filename.replaceAll('\\', '/') === NativeJsonOwner || !isJsonReference(node)) {
    return
  }
  const symbol = resolveJsonSymbol(node, checker)
  if (symbol?.declarations?.some(declaration => declaration.getSourceFile().hasNoDefaultLib)) {
    return 'use the shared Json API; native JSON access belongs in ' + NativeJsonOwner
  }
}

function isJsonReference(node: TypeScript.Node): boolean {
  if (TypeScript.isIdentifier(node)) {
    const memberName = TypeScript.isPropertyAccessExpression(node.parent) && node.parent.name === node
    return node.text === 'JSON' && !memberName
  }
  if (TypeScript.isPropertyAccessExpression(node)) {
    return node.name.text === 'JSON'
  }
  if (TypeScript.isElementAccessExpression(node)) {
    return TypeScript.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'JSON'
  }
  return false
}

function resolveJsonSymbol(node: TypeScript.Node, checker: TypeScript.TypeChecker): TypeScript.Symbol | undefined {
  if (TypeScript.isIdentifier(node) && TypeScript.isShorthandPropertyAssignment(node.parent)) {
    return checker.getShorthandAssignmentValueSymbol(node.parent)
  }
  if (TypeScript.isPropertyAccessExpression(node)) {
    return checker.getSymbolAtLocation(node.name)
  }
  if (TypeScript.isElementAccessExpression(node)) {
    return checker.getPropertyOfType(checker.getTypeAtLocation(node.expression), 'JSON')
  }
  return checker.getSymbolAtLocation(node)
}
