import * as CST from '@cst'
import { Errors, Switch } from '@shared'
import * as AST from '../AST'

/** Construct dispatches a CST node to its stateless semantic transformer. */
export function Construct<Kind extends AST.Node['kind']>(
  cst: CST.SyntaxNode,
  kind: Kind | readonly Kind[],
): AST.OfKind<Kind> {
  const result = Switch.on<CST.SyntaxNode, 'type', AST.Node>(cst, 'type', constructors)
  if (!AST.IsKind(result, kind)) {
    Errors.ThrowShouldNeverHappen(`Unexpected ${result.kind} for CST ${cst.type}.`)
  }
  return result
}

/** OptionalVisibility reads an optional declaration visibility field from its CST node. */
export function OptionalVisibility(cst: CST.SyntaxNode): AST.Visibility | undefined {
  const visibility = cst.childForFieldName('visibility')
  return visibility?.text as AST.Visibility | undefined
}

/** Field constructs one required CST field with an expected semantic kind. */
export function Field<Kind extends AST.Node['kind']>(
  cst: CST.SyntaxNode,
  field: string,
  kind: Kind | readonly Kind[],
): AST.OfKind<Kind> {
  return Construct(CST.RequiredField(cst, field), kind)
}

/** List constructs each named child with one of the expected semantic kinds. */
export function List<Kind extends AST.Node['kind']>(
  cst: CST.SyntaxNode,
  kinds: readonly Kind[],
): AST.OfKind<Kind>[] {
  return cst.namedChildren.filter(CST.IsSemanticNode).map(child => Construct(child, kinds))
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
