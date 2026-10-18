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

/** File contains the declarations in one source snapshot. */
export type File = { readonly kind: 'File'; readonly declarations: readonly Declaration[] }

/** AppDeclaration names an app and its unresolved root view. */
export type AppDeclaration = { readonly kind: 'AppDeclaration'; readonly name: Name; readonly root: Name }

/** ViewDeclaration defines parameters and one render body. */
export type ViewDeclaration = {
  readonly kind: 'ViewDeclaration'
  readonly name: Name
  readonly parameters: readonly Parameter[]
  readonly render: ViewRender | Injection
}

/** Parameter preserves an authored parameter name and unresolved type. */
export type Parameter = { readonly kind: 'Parameter'; readonly name: Name; readonly type: Name }

/** ViewRender invokes a view with positional arguments and child renders. */
export type ViewRender = {
  readonly kind: 'ViewRender'
  readonly target: Name
  readonly arguments: readonly Expression[]
  readonly children: readonly ViewRender[]
}

/** Injection preserves an opaque TypeScript body and explicit capture bindings. */
export type Injection = { readonly kind: 'Injection'; readonly captures: readonly Capture[]; readonly code: string }

/** Capture binds a native local to a Tao value or contextual children. */
export type Capture = { readonly kind: 'Capture'; readonly name: Name; readonly value: Name | ContextReference }

/** Expression represents the first app's literal and name expressions. */
export type Expression = Name | TextLiteral

/** TextLiteral contains a decoded authored text value. */
export type TextLiteral = { readonly kind: 'TextLiteral'; readonly value: string }

/** ContextReference preserves an unresolved contextual capture such as @@children. */
export type ContextReference = { readonly kind: 'ContextReference'; readonly value: string }

/** Name preserves an authored identifier without resolving it. */
export type Name = { readonly kind: 'Name'; readonly value: string }

/** Origin locates a semantic node using half-open UTF-16 source offsets. */
export type Origin = { readonly start: number; readonly end: number }

/** Document owns a semantic root and its source origins without retaining CST nodes. */
export type Document = { readonly root: File; readonly origins: ReadonlyMap<Node, Origin> }

type Declaration = AppDeclaration | ViewDeclaration
