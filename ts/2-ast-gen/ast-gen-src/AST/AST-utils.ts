import * as CST from '@cst'
import type * as AST from '../AST'

/** Node represents a semantic node without retaining its source CST. */
export type Node =
  | AST.File
  | AST.Declaration
  | AST.NamedImport
  | AST.ImportPath
  | AST.RequiresDeclaration
  | Name
  | AST.Parameter
  | AST.ViewRender
  | AST.Injection
  | AST.ForeignView
  | AST.Capture
  | AST.Expression
  | AST.ContextReference
  | AST.TestDeclaration
  | AST.TestStep
  | AST.Expectation
  | AST.RenderTag

/** Name preserves an authored identifier without resolving it. */
export type Name = AST.Semantic<'Name', { value: string }>

/** Node constructs a semantic node with its source range. */
export function Node<Kind extends AST.Node['kind']>(
  cst: CST.SyntaxNode,
  kind: Kind,
  fields: Fields<Kind>,
): AST.OfKind<Kind> {
  return { ...fields, kind, start: cst.startIndex, end: cst.endIndex } as AST.OfKind<Kind>
}

/** Name constructs a semantic identifier from its CST node. */
export function Name(cst: CST.SyntaxNode): AST.Name {
  const parts = cst.namedChildren.filter(child => child.type === 'Identifier')
  return Node(cst, 'Name', { value: parts.length ? parts.map(child => child.text).join('.') : cst.text })
}

/** IsAppDeclaration narrows a semantic node to an app declaration. */
export function IsAppDeclaration(node: AST.Node): node is AST.AppDeclaration {
  return IsKind(node, 'AppDeclaration')
}

/** IsViewDeclaration narrows a semantic node to a view declaration. */
export function IsViewDeclaration(node: AST.Node): node is AST.ViewDeclaration {
  return IsKind(node, 'ViewDeclaration')
}

/** IsTestsDeclaration narrows a semantic node to an app-test suite. */
export function IsTestsDeclaration(node: AST.Node): node is AST.TestsDeclaration {
  return IsKind(node, 'TestsDeclaration')
}

/** IsLetDefinition narrows a semantic node to a lexical value definition. */
export function IsLetDefinition(node: AST.Node): node is AST.LetDefinition {
  return IsKind(node, 'LetDefinition')
}

/** IsValueDeclaration narrows a semantic node to a value declaration. */
export function IsValueDeclaration(node: AST.Node): node is AST.ValueDeclaration {
  return IsKind(node, ['AppDeclaration', 'ViewDeclaration', 'LetDefinition'])
}

/** IsUseStatement narrows a semantic node to a declaration import. */
export function IsUseStatement(node: AST.Node): node is AST.UseStatement {
  return IsKind(node, 'UseStatement')
}

/** IsUsePackageStatement narrows a semantic node to a package import. */
export function IsUsePackageStatement(node: AST.Node): node is AST.UsePackageStatement {
  return IsKind(node, 'UsePackageStatement')
}

/** IsViewRender narrows a semantic node to a view invocation. */
export function IsViewRender(node: AST.Node): node is AST.ViewRender {
  return IsKind(node, 'ViewRender')
}

/** IsInjection narrows a semantic node to an injection. */
export function IsInjection(node: AST.Node): node is AST.Injection {
  return IsKind(node, 'Injection')
}

/** IsKind narrows a semantic node to the requested discriminant or discriminants. */
export function IsKind<Kind extends AST.Node['kind']>(
  node: AST.Node,
  kind: Kind | readonly Kind[],
): node is AST.OfKind<Kind> {
  return typeof kind === 'string' ? node.kind === kind : kind.some(candidate => candidate === node.kind)
}

type Fields<Kind extends AST.Node['kind']> = Omit<AST.OfKind<Kind>, 'kind' | 'start' | 'end'>
