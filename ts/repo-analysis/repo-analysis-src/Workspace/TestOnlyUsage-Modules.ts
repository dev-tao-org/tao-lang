import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

type ModuleReference = { source: TypeScript.SourceFile; specifier: TypeScript.StringLiteralLike }

/** readModuleReference resolves the literal module targeted by an import or re-export. */
export function readModuleReference(
  node: TypeScript.Node,
  checker: TypeScript.TypeChecker,
): ModuleReference | undefined {
  const specifier = readModuleSpecifier(node)
  if (specifier === undefined || !TypeScript.isStringLiteralLike(specifier)) {
    return
  }
  const source = checker.getSymbolAtLocation(specifier)?.valueDeclaration
  if (source && TypeScript.isSourceFile(source)) {
    return { source, specifier }
  }
}

function readModuleSpecifier(node: TypeScript.Node): TypeScript.Expression | undefined {
  if (TypeScript.isImportDeclaration(node) || TypeScript.isExportDeclaration(node)) {
    return node.moduleSpecifier
  }
  if (TypeScript.isCallExpression(node) && node.expression.kind === TypeScript.SyntaxKind.ImportKeyword) {
    return node.arguments[0]
  }
  if (TypeScript.isImportTypeNode(node) && TypeScript.isLiteralTypeNode(node.argument)) {
    return node.argument.literal
  }
}
