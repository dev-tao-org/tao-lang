import { Errors } from '@shared'
import type Parser from 'tree-sitter'
import * as AST from './AST'
import { Construct } from './Transform'
import { AppDeclaration, File, LetDefinition, Parameter } from './TransformDeclarations'
import {
  ImportPath,
  NamedImport,
  QualifiedName,
  RequiresDeclaration,
  UsePackageStatement,
  UseStatement,
} from './TransformModules'
import {
  Capture,
  ContextReference,
  ForeignView,
  Injection,
  TextLiteral,
  ViewDeclaration,
  ViewRender,
} from './TransformViews'

export * from './AST'
export {
  ExpectStatement,
  InputExpectation,
  PressStatement,
  RenderTag,
  RunStatement,
  TestDeclaration,
  TestsDeclaration,
  TextExpectation,
  TypeStatement,
} from './TransformTests'
export { Construct }
export {
  AppDeclaration,
  Capture,
  ContextReference,
  File,
  ForeignView,
  Injection,
  LetDefinition,
  Parameter,
  TextLiteral,
  ViewDeclaration,
  ViewRender,
}
export { ImportPath, NamedImport, QualifiedName, RequiresDeclaration, UsePackageStatement, UseStatement }

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
  return cst.namedChildren.filter(child => child.type !== 'Comment').map(child => Construct(child, kinds))
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
