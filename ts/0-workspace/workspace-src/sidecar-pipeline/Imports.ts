import { Path } from '@shared/os'
import * as TypeScript from 'typescript'

/** fileExtension returns the final extension used to resolve a sidecar dependency. */
export const fileExtension = Path.extname

/** moduleSpecifiers finds literal imports, exports, and require calls in TypeScript source. */
export function moduleSpecifiers(source: string): string[] {
  const file = TypeScript.createSourceFile('sidecar.tsx', source, TypeScript.ScriptTarget.Latest, true)
  const result = new Set<string>()
  collectModuleSpecifiers(file, result)
  return [...result]
}

function collectModuleSpecifiers(node: TypeScript.Node, result: Set<string>): void {
  if (TypeScript.isImportDeclaration(node) || TypeScript.isExportDeclaration(node)) {
    addLiteralSpecifier(node.moduleSpecifier, result)
  }
  if (TypeScript.isCallExpression(node) && isModuleLoader(node.expression)) {
    addLiteralSpecifier(node.arguments[0], result)
  }
  TypeScript.forEachChild(node, child => collectModuleSpecifiers(child, result))
}

function isModuleLoader(expression: TypeScript.Expression): boolean {
  return expression.kind === TypeScript.SyntaxKind.ImportKeyword
    || TypeScript.isIdentifier(expression) && expression.text === 'require'
}

function addLiteralSpecifier(node: TypeScript.Node | undefined, result: Set<string>): void {
  if (node && (TypeScript.isStringLiteral(node) || TypeScript.isNoSubstitutionTemplateLiteral(node))) {
    result.add(node.text)
  }
}
