import type * as CST from '@cst'
import type * as AST from '../AST'

/** Node represents a semantic node without retaining its source CST. */
export type Node =
  | AST.File
  | AST.Declaration
  | AST.NamedImport
  | AST.ImportPath
  | AST.RequiresDeclaration
  | AST.Name
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

/** Node constructs a semantic node with its source range. */
export function Node<Kind extends AST.Node['kind']>(
  cst: CST.SyntaxNode,
  kind: Kind,
  fields: Fields<Kind>,
): AST.OfKind<Kind> {
  return { ...fields, kind, start: cst.startIndex, end: cst.endIndex } as AST.OfKind<Kind>
}

/** OfKind selects semantic nodes with one of the supplied discriminants. */
export type OfKind<Kind extends AST.Node['kind']> = Extract<AST.Node, { kind: Kind }>

/** Declaration represents a file-level semantic declaration. */
export type Declaration =
  | AST.AppDeclaration
  | AST.ViewDeclaration
  | AST.TestsDeclaration
  | AST.LetDefinition
  | AST.UseStatement
  | AST.UsePackageStatement
  | AST.RequiresDeclaration

/** ValueDeclaration represents a declaration that introduces a value. */
export type ValueDeclaration = AST.AppDeclaration | AST.ViewDeclaration | AST.LetDefinition

/** Visibility limits where a declaration can be referenced. */
export type Visibility = 'file' | 'folder' | 'package' | 'project' | 'public'

/** Expression represents the first app's literal and name expressions. */
export type Expression = AST.Name | AST.TextLiteral

/** TestStep represents a launch, interaction or visible assertion. */
export type TestStep = AST.RunStatement | AST.PressStatement | AST.TypeStatement | AST.ExpectStatement

/** Expectation describes an exact visible text or input-value assertion. */
export type Expectation = AST.TextExpectation | AST.InputExpectation

/** Document owns a semantic root without retaining CST nodes. */
export type Document = { readonly root: AST.File }

/** Semantic combines a node's kind and numeric source range with its immutable fields. */
export type Semantic<Kind extends string, Fields> = {
  readonly kind: Kind
  readonly start: number
  readonly end: number
} & Readonly<Fields>

type Fields<Kind extends AST.Node['kind']> = Omit<AST.OfKind<Kind>, 'kind' | 'start' | 'end'>
