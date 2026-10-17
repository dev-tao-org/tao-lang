import * as TypeScript from 'typescript'

/** ApiGroup describes declarations which share one exported API name. */
export type ApiGroup = { name?: string; nodes: TypeScript.Node[]; exported: boolean }

/** isFunctionProperty detects function-valued object properties. */
export function isFunctionProperty(node: TypeScript.Node): boolean {
  if (!TypeScript.isPropertyAssignment(node)) {
    return false
  }
  let value = node.initializer
  while (isExpressionWrapper(value)) {
    value = value.expression
  }
  return TypeScript.isArrowFunction(value) || TypeScript.isFunctionExpression(value)
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

/** docs collects JSDoc comments attached to declarations. */
export function docs(source: string, nodes: readonly TypeScript.Node[]): TypeScript.CommentRange[] {
  const ranges = new Map<number, TypeScript.CommentRange>()
  for (const node of nodes) {
    for (const range of TypeScript.getLeadingCommentRanges(source, node.getFullStart()) ?? []) {
      if (source.startsWith('/**', range.pos)) {
        ranges.set(range.pos, range)
      }
    }
  }
  return [...ranges.values()]
}

/** isPrivateApiMember detects private declarations and private class members. */
export function isPrivateApiMember(node: TypeScript.Node): boolean {
  if (
    TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.PrivateKeyword)
  ) {
    return true
  }
  return hasPrivateName(node)
}

function hasPrivateName(node: TypeScript.Node): boolean {
  return (TypeScript.isPropertyDeclaration(node) || TypeScript.isMethodDeclaration(node)
    || TypeScript.isGetAccessorDeclaration(node) || TypeScript.isSetAccessorDeclaration(node))
    && TypeScript.isPrivateIdentifier(node.name)
}

/** isApiMember identifies signature members which may carry public docs. */
export function isApiMember(node: TypeScript.Node): boolean {
  return TypeScript.isTypeElement(node) || TypeScript.isClassElement(node) || TypeScript.isParameter(node)
}

/** bindingNames returns identifiers contained in a binding pattern. */
export function bindingNames(name: TypeScript.BindingName): TypeScript.Identifier[] {
  if (TypeScript.isIdentifier(name)) {
    return [name]
  }
  return name.elements.flatMap(element => TypeScript.isBindingElement(element) ? bindingNames(element.name) : [])
}

/** isAmbientNamespace detects ambient namespace declarations and descendants. */
export function isAmbientNamespace(node: TypeScript.Node): boolean {
  let current: TypeScript.Node | undefined = node
  while (current) {
    if (TypeScript.isSourceFile(current)) {
      return current.isDeclarationFile
    }
    if (
      TypeScript.canHaveModifiers(current)
      && TypeScript.getModifiers(current)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.DeclareKeyword)
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

/** isImplementationNode detects bodies and expressions outside public type shapes. */
export function isImplementationNode(node: TypeScript.Node): boolean {
  return TypeScript.isBlock(node) || TypeScript.isModuleBlock(node) || TypeScript.isClassStaticBlockDeclaration(node)
    || (TypeScript.isExpression(node) && !isPublicShapeExpression(node))
}

function isPublicShapeExpression(node: TypeScript.Node): boolean {
  return TypeScript.isObjectLiteralExpression(node) || TypeScript.isArrowFunction(node)
    || TypeScript.isFunctionExpression(node)
}

/** isApiDeclaration identifies declarations that can define public API groups. */
export function isApiDeclaration(
  node: TypeScript.Node,
): node is
  | TypeScript.FunctionDeclaration
  | TypeScript.ClassDeclaration
  | TypeScript.InterfaceDeclaration
  | TypeScript.TypeAliasDeclaration
  | TypeScript.EnumDeclaration
  | TypeScript.ModuleDeclaration
{
  return TypeScript.isFunctionDeclaration(node) || TypeScript.isClassDeclaration(node)
    || TypeScript.isInterfaceDeclaration(node)
    || TypeScript.isTypeAliasDeclaration(node) || TypeScript.isEnumDeclaration(node)
    || TypeScript.isModuleDeclaration(node)
}

/** isExported detects declarations with an export modifier. */
export function isExported(node: TypeScript.Node): boolean {
  return TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.ExportKeyword) === true
}

/** isLocalNamedExport detects named exports that refer to local declarations. */
export function isLocalNamedExport(node: TypeScript.ExportDeclaration): node is TypeScript.ExportDeclaration & {
  exportClause: TypeScript.NamedExports
} {
  return !node.moduleSpecifier && node.exportClause !== undefined && TypeScript.isNamedExports(node.exportClause)
}

/** normalizeDoc removes JSDoc formatting and normalizes description whitespace. */
export function normalizeDoc(text: string): string {
  return text.replace(/^\s*\* ?/gm, '').trim().split(/\s+/).join(' ')
}

/** hasDescription checks that a JSDoc comment starts with a name and description. */
export function hasDescription(text: string, name?: string): boolean {
  if (name === undefined) {
    return /^\S+\s+\S+/.test(text)
  }
  if (!text.startsWith(name)) {
    return false
  }
  const next = text[name.length]
  return next !== undefined && !/[\w$]/.test(next) && text.slice(name.length).trim().length > 1
}

/** hasValidDocLayout checks the repository JSDoc opening, continuation, and closing layout. */
export function hasValidDocLayout(source: string, range: TypeScript.CommentRange): boolean {
  const lines = source.slice(range.pos, range.end).split(/\r\n|\r|\n/)
  if (lines.length === 1) {
    return true
  }
  const indentation = source.slice(source.lastIndexOf('\n', range.pos) + 1, range.pos).match(/^[\t ]*/)![0]
  const prefix = indentation + ' *  '
  return /^\/\*\* \S+ \S/.test(lines[0]) && /\S \*\/$/.test(lines[lines.length - 1])
    && lines.slice(1).every(line => line.startsWith(prefix) && /^\S/.test(line.slice(prefix.length)))
}
