import { Errors, Switch, Timings } from '@shared'
import type Parser from 'tree-sitter'
import * as AST from './Construction'

/** transform constructs an AST only for a syntactically valid source snapshot.
 *  Returned semantic nodes and numeric origins do not retain the caller-owned CST. */
export function transform(
  tree: Parser.Tree,
  timings = new Timings(),
): AST.Document | undefined {
  if (tree.rootNode.hasError) {
    return undefined
  }
  return Timings.exec(timings, 'transformer.transform', () => ({ root: AST.Construct(tree.rootNode, 'File') }))
}

/** Construct dispatches a CST node to its stateless semantic transformer. */
export function Construct<Kind extends AST.Node['kind']>(
  cst: Parser.SyntaxNode,
  kind: Kind | readonly Kind[],
): AST.OfKind<Kind> {
  const result = Switch.on<Parser.SyntaxNode, 'type', AST.Node>(cst, 'type', constructors)
  if (!AST.IsKind(result, kind)) {
    Errors.ThrowUnexpected(`Unexpected ${result.kind} for CST ${cst.type}.`)
  }
  return result
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
