import { Source } from '@shared'
import * as TypeScript from 'typescript'

export {
  type ApiGroup,
  collectBindingNames,
  docs,
  hasDescription,
  hasValidDocLayout,
  isAmbientNamespace,
  isApiDeclaration,
  isApiMember,
  isExported,
  isImplementationNode,
  isLocalNamedExport,
  isPrivateApiMember,
  normalizeDoc,
}

/** ApiGroup describes declarations which share one exported API name. */
type ApiGroup = { name?: string; nodes: TypeScript.Node[]; exported: boolean }

/** docs collects JSDoc comments attached to declarations. */
function docs(source: string, nodes: readonly TypeScript.Node[]): TypeScript.CommentRange[] {
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
function isPrivateApiMember(node: TypeScript.Node): boolean {
  if (
    TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.PrivateKeyword)
  ) {
    return true
  }
  return hasPrivateName(node)
}

/** isApiMember identifies signature members which may carry public docs. */
function isApiMember(node: TypeScript.Node): boolean {
  return TypeScript.isTypeElement(node) || TypeScript.isClassElement(node) || TypeScript.isParameter(node)
}

/** collectBindingNames returns identifiers contained in a binding pattern. */
function collectBindingNames(name: TypeScript.BindingName): TypeScript.Identifier[] {
  if (TypeScript.isIdentifier(name)) {
    return [name]
  }
  return name.elements.flatMap(element => TypeScript.isBindingElement(element) ? collectBindingNames(element.name) : [])
}

/** isAmbientNamespace detects ambient namespace declarations and descendants. */
function isAmbientNamespace(node: TypeScript.Node): boolean {
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
function isImplementationNode(node: TypeScript.Node): boolean {
  return isImplementationContainer(node) || (TypeScript.isExpression(node) && !isPublicShapeExpression(node))
}

/** isApiDeclaration identifies declarations that can define public API groups. */
function isApiDeclaration(
  node: TypeScript.Node,
): node is
  | TypeScript.FunctionDeclaration
  | TypeScript.ClassDeclaration
  | TypeScript.InterfaceDeclaration
  | TypeScript.TypeAliasDeclaration
  | TypeScript.EnumDeclaration
  | TypeScript.ModuleDeclaration
{
  return isCallableDeclaration(node) || isTypeDeclaration(node) || isContainerDeclaration(node)
}

/** isExported detects declarations with an export modifier. */
function isExported(node: TypeScript.Node): boolean {
  return TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.ExportKeyword) === true
}

/** isLocalNamedExport detects named exports that refer to local declarations. */
function isLocalNamedExport(node: TypeScript.ExportDeclaration): node is LocalNamedExport {
  return !node.moduleSpecifier && node.exportClause !== undefined && TypeScript.isNamedExports(node.exportClause)
}

type LocalNamedExport = TypeScript.ExportDeclaration & { exportClause: TypeScript.NamedExports }

/** normalizeDoc removes JSDoc formatting and normalizes description whitespace. */
function normalizeDoc(text: string): string {
  return text.replace(/^\s*\* ?/gm, '').trim().split(/\s+/).join(' ')
}

/** hasDescription checks that a JSDoc comment starts with a name and description. */
function hasDescription(text: string, name?: string): boolean {
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
function hasValidDocLayout(source: string, range: TypeScript.CommentRange): boolean {
  const lines = Source.slice(source, range.pos, range.end).split(/\r\n|\r|\n/)
  if (lines.length === 1) {
    return true
  }
  const indentation = Source.slice(source, Source.lineStartBefore(source, range.pos), range.pos).match(/^[\t ]*/)![0]
  const prefix = indentation + ' *  '
  return /^\/\*\* \S+ \S/.test(lines[0]) && /\S \*\/$/.test(lines[lines.length - 1])
    && lines.slice(1).every(line => line.startsWith(prefix) && /^\S/.test(line.slice(prefix.length)))
}

function hasPrivateName(node: TypeScript.Node): boolean {
  return (TypeScript.isPropertyDeclaration(node) || TypeScript.isMethodDeclaration(node)
    || TypeScript.isGetAccessorDeclaration(node) || TypeScript.isSetAccessorDeclaration(node))
    && TypeScript.isPrivateIdentifier(node.name)
}

function isPublicShapeExpression(node: TypeScript.Node): boolean {
  return TypeScript.isObjectLiteralExpression(node) || TypeScript.isArrowFunction(node)
    || TypeScript.isFunctionExpression(node)
}

function isImplementationContainer(node: TypeScript.Node): boolean {
  return TypeScript.isBlock(node) || TypeScript.isModuleBlock(node)
    || TypeScript.isClassStaticBlockDeclaration(node)
}

function isCallableDeclaration(
  node: TypeScript.Node,
): node is TypeScript.FunctionDeclaration | TypeScript.ClassDeclaration {
  return TypeScript.isFunctionDeclaration(node) || TypeScript.isClassDeclaration(node)
}

function isTypeDeclaration(
  node: TypeScript.Node,
): node is TypeScript.InterfaceDeclaration | TypeScript.TypeAliasDeclaration {
  return TypeScript.isInterfaceDeclaration(node) || TypeScript.isTypeAliasDeclaration(node)
}

function isContainerDeclaration(
  node: TypeScript.Node,
): node is TypeScript.EnumDeclaration | TypeScript.ModuleDeclaration {
  return TypeScript.isEnumDeclaration(node) || TypeScript.isModuleDeclaration(node)
}
