import { Errors } from '@shared'
import type Parser from 'tree-sitter'
import * as AST from './AST'
import { Construct } from './Transform'
import { AppDeclaration, File, Parameter } from './TransformDeclarations'
import { Capture, ContextReference, Injection, TextLiteral, ViewDeclaration, ViewRender } from './TransformViews'

export * from './AST'
export { Construct }
export {
  AppDeclaration,
  Capture,
  ContextReference,
  File,
  Injection,
  Parameter,
  TextLiteral,
  ViewDeclaration,
  ViewRender,
}

/** Field constructs one required CST field with an expected semantic kind. */
export function Field<Kind extends AST.Node['kind']>(
  cst: Parser.SyntaxNode,
  field: string,
  kind: Kind | readonly Kind[],
): AST.OfKind<Kind> {
  return Construct(RequiredField(cst, field), kind)
}

/** List constructs each named child with one of the expected semantic kinds. */
export function List<Kind extends AST.Node['kind']>(
  cst: Parser.SyntaxNode,
  kinds: readonly Kind[],
): AST.OfKind<Kind>[] {
  return cst.namedChildren.map(child => Construct(child, kinds))
}

/** RequiredField returns a required CST field. */
export function RequiredField(cst: Parser.SyntaxNode, field: string): Parser.SyntaxNode {
  return cst.childForFieldName(field) ?? Errors.ThrowUnexpected(`Missing CST field ${field} on ${cst.type}.`)
}

/** RequiredChild returns a required named CST child of the requested type. */
export function RequiredChild(cst: Parser.SyntaxNode, type: string): Parser.SyntaxNode {
  return cst.namedChildren.find(child => child.type === type)
    ?? Errors.ThrowUnexpected(`Missing CST child ${type} on ${cst.type}.`)
}
