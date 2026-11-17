import { Json, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { sidecarAssetExtensions } from '../sidecars/SidecarAssets'

type ModuleSpecifierNode = TypeScript.Node | undefined

const ScriptExtensions = ['.tsx', '.ts', '.mts', '.cts', '.jsx', '.js', '.mjs', '.cjs']

/** resolveRelativeImport resolves a sidecar source or asset and records attempted paths for invalidation. */
export async function resolveRelativeImport(path: string, watch: (candidate: string) => void): Promise<string> {
  const suffixes = [...ScriptExtensions, '.d.ts', '.d.mts', '.d.cts', '.json', ...sidecarAssetExtensions]
  const candidates = Path.extname(path) ? [path] : [
    ...suffixes.map(suffix => `${path}${suffix}`),
    ...suffixes.map(suffix => Path.join(path, `index${suffix}`)),
  ]
  for (const candidate of candidates) {
    watch(candidate)
    if (await FS.exists(candidate) && FS.lstatSync(candidate).isFile()) {
      return candidate
    }
  }
  UserInput.Fail(`Cannot resolve foreign view sidecar import: ${path}`)
}

/** isScriptSource identifies TypeScript and JavaScript modules whose imports need capture. */
export function isScriptSource(path: string): boolean {
  return ScriptExtensions.includes(Path.extname(path))
}

const ScriptDeclarationExtensions = new Map([
  ['.js', '.d.ts'],
  ['.jsx', '.d.ts'],
  ['.mjs', '.d.mts'],
  ['.cjs', '.d.cts'],
])

/** findScriptDeclaration captures an authored JavaScript module's optional declaration companion. */
export async function findScriptDeclaration(path: string, watch: (candidate: string) => void) {
  const extension = Path.extname(path)
  const suffix = ScriptDeclarationExtensions.get(extension)
  if (!suffix) {
    return undefined
  }
  const candidate = path.slice(0, -extension.length) + suffix
  watch(candidate)
  return await FS.exists(candidate) ? candidate : undefined
}

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
  if (TypeScript.isImportTypeNode(node) && TypeScript.isLiteralTypeNode(node.argument)) {
    visitLiteralSpecifier(node.argument.literal, visit)
  }
  if (TypeScript.isExternalModuleReference(node)) {
    visitLiteralSpecifier(node.expression, visit)
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
