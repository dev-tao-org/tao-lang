import { Errors, Switch } from '@shared'
import type Parser from 'tree-sitter'
import * as AST from '../AST'

/** Construct dispatches a CST node to its stateless semantic transformer. */
export function Construct<Kind extends AST.Node['kind']>(
  cst: Parser.SyntaxNode,
  kind: Kind | readonly Kind[],
): AST.OfKind<Kind> {
  const result = Switch.on<Parser.SyntaxNode, 'type', AST.Node>(cst, 'type', constructors)
  if (!AST.IsKind(result, kind)) {
    Errors.ThrowShouldNeverHappen(`Unexpected ${result.kind} for CST ${cst.type}.`)
  }
  return result
}

/** OptionalVisibility reads an optional declaration visibility field from its CST node. */
export function OptionalVisibility(cst: Parser.SyntaxNode): AST.Visibility | undefined {
  const visibility = cst.childForFieldName('visibility')
  return visibility ? visibility.text as AST.Visibility : undefined
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
  return cst.namedChildren.filter(child => child.type !== 'Comment').map(child => Construct(child, kinds))
}

/** RequiredField returns a required CST field. */
export function RequiredField(cst: Parser.SyntaxNode, field: string): Parser.SyntaxNode {
  return cst.childForFieldName(field) ?? Errors.ThrowShouldNeverHappen(`Missing CST field ${field} on ${cst.type}.`)
}

/** RequiredChild returns a required named CST child of the requested type. */
export function RequiredChild(cst: Parser.SyntaxNode, type: string): Parser.SyntaxNode {
  return cst.namedChildren.find(child => child.type === type)
    ?? Errors.ThrowShouldNeverHappen(`Missing CST child ${type} on ${cst.type}.`)
}

const constructors = {
  SourceFile: AST.File,
  AppDeclaration: AST.AppDeclaration,
  LetDefinition: AST.LetDefinition,
  UseStatement: AST.UseStatement,
  UsePackageStatement: AST.UsePackageStatement,
  RequiresDeclaration: AST.RequiresDeclaration,
  NamedImport: AST.NamedImport,
  ImportPath: AST.ImportPath,
  ViewDeclaration: AST.ViewDeclaration,
  ViewRender: AST.ViewRender,
  Parameter: AST.Parameter,
  Injection: AST.Injection,
  ForeignView: AST.ForeignView,
  InjectionCapture: AST.Capture,
  Identifier: AST.Name,
  QualifiedName: AST.QualifiedName,
  ContextReference: AST.ContextReference,
  TextLiteral: AST.TextLiteral,
  RenderTag: AST.RenderTag,
  TestsDeclaration: AST.TestsDeclaration,
  TestDeclaration: AST.TestDeclaration,
  RunStatement: AST.RunStatement,
  PressStatement: AST.PressStatement,
  TypeStatement: AST.TypeStatement,
  ExpectStatement: AST.ExpectStatement,
  TextExpectation: AST.TextExpectation,
  InputExpectation: AST.InputExpectation,
  InputValueExpectation: AST.InputExpectation,
}
