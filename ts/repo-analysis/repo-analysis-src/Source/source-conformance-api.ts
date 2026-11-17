import { Regxs, Source } from '@shared'
import { TypeScript } from '@tao/shared/typescript'

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
type OptionalSyntaxNode = TypeScript.Node | undefined
type ApiDeclaration = CallableDeclaration | TypeDeclaration | ContainerDeclaration
type CallableDeclaration = TypeScript.FunctionDeclaration | TypeScript.ClassDeclaration
type TypeDeclaration = TypeScript.InterfaceDeclaration | TypeScript.TypeAliasDeclaration
type ContainerDeclaration = TypeScript.EnumDeclaration | TypeScript.ModuleDeclaration

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

type ApiMember = TypeScript.TypeElement | TypeScript.ClassElement | TypeScript.ParameterDeclaration

/** isApiMember identifies signature members which may carry public docs. */
function isApiMember(node: TypeScript.Node): node is ApiMember {
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
  let current: OptionalSyntaxNode = node
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
function isApiDeclaration(node: TypeScript.Node): node is ApiDeclaration {
  return isCallableDeclaration(node) || isTypeDeclaration(node) || isContainerDeclaration(node)
}

/** isExported detects declarations with an export modifier. */
function isExported(node: TypeScript.Node): boolean {
  return TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.ExportKeyword) === true
}

type LocalNamedExport = TypeScript.ExportDeclaration & { exportClause: TypeScript.NamedExports }
/** isLocalNamedExport detects named exports that refer to local declarations. */
function isLocalNamedExport(node: TypeScript.ExportDeclaration): node is LocalNamedExport {
  return !node.moduleSpecifier && node.exportClause !== undefined && TypeScript.isNamedExports(node.exportClause)
}

/** normalizeDoc removes JSDoc formatting and normalizes description whitespace. */
function normalizeDoc(text: string): string {
  return text.replace(Regxs.DocLinePrefix, '').trim().split(Regxs.WhitespaceRunsRegx).join(' ')
}

/** hasDescription checks that a JSDoc comment starts with a name and description. */
function hasDescription(text: string, name?: string): boolean {
  if (name === undefined) {
    return Regxs.DocDescription.test(text)
  }
  if (!text.startsWith(name)) {
    return false
  }
  const next = text[name.length]
  return next !== undefined && !Regxs.IdentifierCharacter.test(next) && text.slice(name.length).trim().length > 1
}

/** hasValidDocLayout checks the repository JSDoc opening, continuation, and closing layout. */
function hasValidDocLayout(source: string, range: TypeScript.CommentRange): boolean {
  const lines = Source.slice(source, range.pos, range.end).split(Regxs.LineBreak)
  if (lines.length === 1) {
    return true
  }
  const indentation = Source.slice(source, Source.lineStartBefore(source, range.pos), range.pos).match(
    Regxs.LeadingHorizontalWhitespaceRegx,
  )![0]
  const prefix = indentation + ' *  '
  return Regxs.DocOpeningLine.test(lines[0]) && Regxs.DocClosingLine.test(lines[lines.length - 1])
    && lines.slice(1).every(line => line.startsWith(prefix) && Regxs.NonWhitespaceStart.test(line.slice(prefix.length)))
}

function hasPrivateName(node: TypeScript.Node): boolean {
  if (TypeScript.isPropertyDeclaration(node) || TypeScript.isMethodDeclaration(node)) {
    return TypeScript.isPrivateIdentifier(node.name)
  }
  if (TypeScript.isGetAccessorDeclaration(node) || TypeScript.isSetAccessorDeclaration(node)) {
    return TypeScript.isPrivateIdentifier(node.name)
  }
  return false
}

type PublicShapeExpression =
  | TypeScript.ObjectLiteralExpression
  | TypeScript.ArrowFunction
  | TypeScript.FunctionExpression

function isPublicShapeExpression(node: TypeScript.Node): node is PublicShapeExpression {
  return TypeScript.isObjectLiteralExpression(node) || TypeScript.isArrowFunction(node)
    || TypeScript.isFunctionExpression(node)
}

type ImplementationContainer = TypeScript.Block | TypeScript.ModuleBlock | TypeScript.ClassStaticBlockDeclaration

function isImplementationContainer(node: TypeScript.Node): node is ImplementationContainer {
  return TypeScript.isBlock(node) || TypeScript.isModuleBlock(node)
    || TypeScript.isClassStaticBlockDeclaration(node)
}

function isCallableDeclaration(node: TypeScript.Node): node is CallableDeclaration {
  return TypeScript.isFunctionDeclaration(node) || TypeScript.isClassDeclaration(node)
}

function isTypeDeclaration(node: TypeScript.Node): node is TypeDeclaration {
  return TypeScript.isInterfaceDeclaration(node) || TypeScript.isTypeAliasDeclaration(node)
}

function isContainerDeclaration(node: TypeScript.Node): node is ContainerDeclaration {
  return TypeScript.isEnumDeclaration(node) || TypeScript.isModuleDeclaration(node)
}
