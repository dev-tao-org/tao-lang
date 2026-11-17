import { Json } from '@shared'
import { Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

type ModuleSpecifierNode = TypeScript.Node | undefined

/** getFileExtension returns the final extension used to resolve a sidecar dependency. */
export const getFileExtension = Path.extname

/** collectModuleSpecifiers finds imports, exports, and require calls in TypeScript source. */
export function collectModuleSpecifiers(source: string): string[] {
  const result = new Set<string>()
  visitSourceSpecifiers(source, node => result.add(node.text))
  return [...result]
}

/** rewriteModuleSpecifiers updates only parsed module specifiers in a portable sidecar snapshot. */
export function rewriteModuleSpecifiers(source: string, resolve: (specifier: string) => string): string {
  const edits: SpecifierEdit[] = []
  visitSourceSpecifiers(source, node => {
    const specifier = resolve(node.text)
    if (specifier !== node.text) {
      edits.push({ start: node.getStart(), end: node.getEnd(), text: Json.Print(specifier) })
    }
  })
  for (const edit of edits.reverse()) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  }
  return source
}

type SpecifierEdit = { start: number; end: number; text: string }
type SpecifierVisitor = (node: TypeScript.StringLiteralLike) => void

function visitSourceSpecifiers(source: string, visit: SpecifierVisitor): void {
  const file = TypeScript.createSourceFile('sidecar.tsx', source, TypeScript.ScriptTarget.Latest, true)
  visitModuleSpecifiers(file, visit)
}

function visitModuleSpecifiers(node: TypeScript.Node, visit: SpecifierVisitor): void {
  if (TypeScript.isImportDeclaration(node) || TypeScript.isExportDeclaration(node)) {
    visitLiteralSpecifier(node.moduleSpecifier, visit)
  }
  if (TypeScript.isCallExpression(node) && isModuleLoader(node.expression)) {
    visitLiteralSpecifier(node.arguments[0], visit)
  }
  TypeScript.forEachChild(node, child => visitModuleSpecifiers(child, visit))
}

function isModuleLoader(expression: TypeScript.Expression): boolean {
  return expression.kind === TypeScript.SyntaxKind.ImportKeyword
    || TypeScript.isIdentifier(expression) && expression.text === 'require'
}

function visitLiteralSpecifier(node: ModuleSpecifierNode, visit: SpecifierVisitor): void {
  if (node && (TypeScript.isStringLiteral(node) || TypeScript.isNoSubstitutionTemplateLiteral(node))) {
    visit(node)
  }
}
