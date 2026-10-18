import type Parser from 'tree-sitter'

/** Node represents a semantic node without retaining its source CST. */
export type Node =
  | File
  | Declaration
  | Name
  | Parameter
  | ViewRender
  | Injection
  | Capture
  | Expression
  | ContextReference

/** OfKind selects semantic nodes with one of the supplied discriminants. */
export type OfKind<Kind extends Node['kind']> = Extract<Node, { kind: Kind }>

/** File contains the declarations in one source snapshot. */
export type File = Semantic<'File', { declarations: readonly Declaration[] }>

/** AppDeclaration names an app and its unresolved root view. */
export type AppDeclaration = Semantic<'AppDeclaration', { name: Name; root: Name }>

/** ViewDeclaration defines parameters and one render body. */
export type ViewDeclaration = Semantic<'ViewDeclaration', {
  name: Name
  parameters: readonly Parameter[]
  render: ViewRender | Injection
}>

/** Parameter preserves an authored parameter name and unresolved type. */
export type Parameter = Semantic<'Parameter', { name: Name; type: Name }>

/** ViewRender invokes a view with positional arguments and child renders. */
export type ViewRender = Semantic<'ViewRender', {
  target: Name
  arguments: readonly Expression[]
  children: readonly ViewRender[]
}>

/** Injection preserves an opaque TypeScript body and explicit capture bindings. */
export type Injection = Semantic<'Injection', { captures: readonly Capture[]; code: string }>

/** Capture binds a native local to a Tao value or contextual children. */
export type Capture = Semantic<'Capture', { name: Name; value: Name | ContextReference }>

/** Expression represents the first app's literal and name expressions. */
export type Expression = Name | TextLiteral

/** TextLiteral contains a decoded authored text value. */
export type TextLiteral = Semantic<'TextLiteral', { value: string }>

/** ContextReference preserves an unresolved contextual capture such as @@children. */
export type ContextReference = Semantic<'ContextReference', { value: string }>

/** Name preserves an authored identifier without resolving it. */
export type Name = Semantic<'Name', { value: string }>

/** Document owns a semantic root without retaining CST nodes. */
export type Document = { readonly root: File }

/** Node constructs a semantic node with its source range. */
export function Node<Kind extends Node['kind']>(
  cst: Parser.SyntaxNode,
  kind: Kind,
  fields: Fields<Kind>,
): OfKind<Kind> {
  return { ...fields, kind, start: cst.startIndex, end: cst.endIndex } as OfKind<Kind>
}

/** Name constructs a semantic identifier from its CST node. */
export function Name(cst: Parser.SyntaxNode): Name {
  return Node(cst, 'Name', { value: cst.text })
}

/** IsAppDeclaration narrows a semantic node to an app declaration. */
export function IsAppDeclaration(node: Node): node is AppDeclaration {
  return IsKind(node, 'AppDeclaration')
}

/** IsViewDeclaration narrows a semantic node to a view declaration. */
export function IsViewDeclaration(node: Node): node is ViewDeclaration {
  return IsKind(node, 'ViewDeclaration')
}

/** IsInjection narrows a semantic node to an injection. */
export function IsInjection(node: Node): node is Injection {
  return IsKind(node, 'Injection')
}

/** IsKind narrows a semantic node to the requested discriminant or discriminants. */
export function IsKind<Kind extends Node['kind']>(
  node: Node,
  kind: Kind | readonly Kind[],
): node is OfKind<Kind> {
  return typeof kind === 'string' ? node.kind === kind : kind.some(candidate => candidate === node.kind)
}

type Declaration = AppDeclaration | ViewDeclaration
type Semantic<Kind extends string, Fields> = {
  readonly kind: Kind
  readonly start: number
  readonly end: number
} & Readonly<Fields>
type Fields<Kind extends Node['kind']> = Omit<OfKind<Kind>, 'kind' | 'start' | 'end'>
