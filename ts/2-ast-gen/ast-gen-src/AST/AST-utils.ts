import { Errors } from '@shared'
import * as AST from '../AST'

export { IsKind } from '../../_gen_AST/AST-generated'

/** IsAppDeclaration narrows a semantic node to an app declaration. */
export function IsAppDeclaration(node: AST.Node): node is AST.AppDeclaration {
  return AST.IsKind(node, 'AppDeclaration')
}

/** IsViewDeclaration narrows a semantic node to a view declaration. */
export function IsViewDeclaration(node: AST.Node): node is AST.ViewDeclaration {
  return AST.IsKind(node, 'ViewDeclaration')
}

/** IsTestsDeclaration narrows a semantic node to an app-test suite. */
export function IsTestsDeclaration(node: AST.Node): node is AST.TestsDeclaration {
  return AST.IsKind(node, 'TestsDeclaration')
}

/** IsLetDeclaration narrows a semantic node to a lexical value binding. */
export function IsLetDeclaration(node: AST.Node): node is AST.LetDeclaration {
  return AST.IsKind(node, 'LetDeclaration')
}

/** IsValueDeclaration narrows a semantic node to a declaration that owns a name. */
export function IsValueDeclaration(node: AST.Node): node is AST.ValueDeclaration {
  return AST.IsKind(node, ['AppDeclaration', 'ViewDeclaration', 'LetDeclaration'])
}

/** IsDeclaration narrows a statement to a module declaration. */
export function IsDeclaration(node: AST.Node): node is AST.Declaration {
  return AST.IsKind(node, AST.DeclarationKinds)
}

/** IsExpectation narrows a statement to a visible expectation. */
export function IsExpectation(node: AST.Node): node is AST.Expectation {
  return AST.IsKind(node, ['TextExpectation', 'InputExpectation'])
}

/** GetLetDeclarations lists let bindings in one statement block, in authored order. */
export function GetLetDeclarations(statements: readonly AST.Statement[]): readonly AST.LetDeclaration[] {
  return statements.filter(IsLetDeclaration)
}

/** GetNestedViewDeclarations lists child view declarations in one statement block. */
export function GetNestedViewDeclarations(statements: readonly AST.Statement[]): readonly AST.ViewDeclaration[] {
  return statements.filter(IsViewDeclaration)
}

/** GetViewRenderExpressions lists nested view renders in one render block, in authored order. */
export function GetViewRenderExpressions(statements: readonly AST.Statement[]): readonly AST.ViewRenderExpression[] {
  return statements.filter(IsViewRenderExpression)
}

/** FindViewRenderStatement returns a view body's final render statement, when present. */
export function FindViewRenderStatement(block: AST.Block): AST.ViewRenderStatement | undefined {
  return block.statements.find(IsViewRenderStatement)
}

/** HasOnlyViewRenderExpressions reports whether a render block contains only nested renders. */
export function HasOnlyViewRenderExpressions(block: AST.Block): boolean {
  return block.statements.every(IsViewRenderExpression)
}

/** FindViewDeclaration returns the first or named view in one statement block. */
export function FindViewDeclaration(
  statements: readonly AST.Statement[],
  name?: string,
): AST.ViewDeclaration | undefined {
  const views = GetNestedViewDeclarations(statements)
  return name === undefined ? views[0] : views.find(view => view.name.value === name)
}

/** FindLetDeclaration returns the first or named let binding in one statement block. */
export function FindLetDeclaration(
  statements: readonly AST.Statement[],
  name?: string,
): AST.LetDeclaration | undefined {
  const lets = GetLetDeclarations(statements)
  return name === undefined ? lets[0] : lets.find(definition => definition.name.value === name)
}

/** FindValueDeclaration returns one named value declaration in a source document. */
export function FindValueDeclaration(document: AST.Document, name: string): AST.ValueDeclaration | undefined {
  return GetValueDeclarations(document).find(declaration => declaration.name.value === name)
}

/** GetExpectations lists visible assertions in one block, in authored order. */
export function GetExpectations(block: AST.Block): readonly AST.Expectation[] {
  return block.statements.filter(IsExpectation)
}

/** GetTestsDeclarations lists test suites declared in a source document. */
export function GetTestsDeclarations(document: AST.Document): readonly AST.TestsDeclaration[] {
  return document.root.block.statements.filter(IsTestsDeclaration)
}

/** GetTypeScriptLibraryDeclarations lists ts-library declarations, optionally filtered by name. */
export function GetTypeScriptLibraryDeclarations(
  document: AST.Document,
  target?: string,
): readonly AST.TypeScriptLibraryDeclaration[] {
  return document.root.block.statements.filter(
    (node): node is AST.TypeScriptLibraryDeclaration =>
      AST.IsKind(node, 'TypeScriptLibraryDeclaration') && (target === undefined || node.name.value === target),
  )
}

/** GetAppDeclarations lists app declarations in a source document. */
export function GetAppDeclarations(document: AST.Document): AST.AppDeclaration[] {
  return document.root.block.statements.filter(IsAppDeclaration)
}

/** GetDeclarations returns a document's top-level declarations in authored order. */
export function GetDeclarations(document: AST.Document): readonly AST.Declaration[] {
  return document.root.block.statements.filter(IsDeclaration)
}

/** GetAppRoot returns the one app root view name. */
export function GetAppRoot(app: AST.AppDeclaration): AST.Name {
  const root = FindAppRoot(app)
  if (!root) {
    Errors.ThrowShouldNeverHappen('An app declaration has no root view.')
  }
  return root
}

/** FindAppRoot returns the first root view name, when present in the parsed app block. */
export function FindAppRoot(app: AST.AppDeclaration): AST.Name | undefined {
  return app.block.statements.find(statement => AST.IsKind(statement, 'RootDeclaration'))?.view
}

/** FindLibraryPublication returns the first publish declaration in a parsed library block. */
export function FindLibraryPublication(library: AST.TypeScriptLibraryDeclaration): AST.PublishDeclaration | undefined {
  return library.block.statements.find(statement => AST.IsKind(statement, 'PublishDeclaration'))
}

/** GetTests returns the test cases declared directly inside a suite. */
export function GetTests(suite: AST.TestsDeclaration): readonly AST.TestDeclaration[] {
  return suite.block.statements.filter(statement => AST.IsKind(statement, 'TestDeclaration'))
}

/** GetTestSteps returns one test's ordered interaction and assertion steps. */
export function GetTestSteps(test: AST.TestDeclaration): readonly AST.TestStep[] {
  return test.block.statements.filter(isTestStep)
}

/** GetViewDeclarationStatements returns view declarations in authored order, if implemented in Tao. */
export function GetViewDeclarationStatements(
  view: AST.ViewDeclaration,
): readonly AST.ViewDeclarationStatement[] | undefined {
  return AST.IsKind(view.body, 'Block') ? view.body.statements.filter(isViewDeclarationStatement) : undefined
}

/** GetViewRenderBlockStatements returns nested render declarations in authored order. */
export function GetViewRenderBlockStatements(
  expression: AST.ViewRenderExpression,
): readonly AST.ViewRenderBlockStatement[] {
  return expression.block?.statements.filter(isViewRenderBlockStatement) ?? []
}

/** HasAppDeclarations reports whether a source document declares an app. */
export function HasAppDeclarations(document: AST.Document): boolean {
  return document.root.block.statements.some(IsAppDeclaration)
}

/** FindAppDeclaration finds one named app declaration in a source document. */
export function FindAppDeclaration(document: AST.Document, name: string): AST.AppDeclaration | undefined {
  return document.root.block.statements.find(
    (declaration): declaration is AST.AppDeclaration =>
      IsAppDeclaration(declaration) && declaration.name.value === name,
  )
}

/** GetImportStatements lists declaration and package imports in a source document. */
export function GetImportStatements(document: AST.Document): ImportStatement[] {
  return document.root.block.statements.filter(isImportStatement)
}

/** HasImportStatements reports whether a source document declares an import. */
export function HasImportStatements(document: AST.Document): boolean {
  return document.root.block.statements.some(isImportStatement)
}

/** GetValueDeclarations lists named values declared by a source document. */
export function GetValueDeclarations(document: AST.Document): AST.ValueDeclaration[] {
  return document.root.block.statements.filter(IsValueDeclaration)
}

/** GetViewDeclarations lists view declarations in a source document. */
export function GetViewDeclarations(document: AST.Document): AST.ViewDeclaration[] {
  return [...GetNestedViewDeclarations(document.root.block.statements)]
}

/** GetAllViewDeclarations lists top-level and private views in authored preorder. */
export function GetAllViewDeclarations(document: AST.Document): AST.ViewDeclaration[] {
  const views: AST.ViewDeclaration[] = []
  for (const declaration of GetViewDeclarations(document)) {
    appendNestedViews(declaration, views)
  }
  return views
}

/** HasForeignViews reports whether a source document declares a foreign view. */
export function HasForeignViews(document: AST.Document): boolean {
  return GetAllViewDeclarations(document).some(view => GetForeignViewPath(view) !== undefined)
}

/** GetForeignViewPath returns a view's authored module path when its body is foreign. */
export function GetForeignViewPath(view: AST.ViewDeclaration): AST.ImportPath | undefined {
  return AST.IsKind(view.body, 'ForeignView') ? view.body.path : undefined
}

/** GetViewName returns a view's authored declaration name. */
export function GetViewName(view: AST.ViewDeclaration): string {
  return view.name.value
}

/** GetDeclarationVisibility resolves explicit visibility and the app/folder or value/file defaults. */
export function GetDeclarationVisibility(node: AST.ValueDeclaration): AST.Visibility {
  return node.visibility ?? (IsAppDeclaration(node) ? 'folder' : 'file')
}

/** IsUseStatement narrows a semantic node to a declaration import. */
export function IsUseStatement(node: AST.Node): node is AST.UseStatement {
  return AST.IsKind(node, 'UseStatement')
}

/** IsUsePackageStatement narrows a semantic node to a package import. */
export function IsUsePackageStatement(node: AST.Node): node is AST.UsePackageStatement {
  return AST.IsKind(node, 'UsePackageStatement')
}

/** IsViewRenderExpression narrows a semantic node to a recursive view invocation. */
export function IsViewRenderExpression(node: AST.Node): node is AST.ViewRenderExpression {
  return AST.IsKind(node, 'ViewRenderExpression')
}

/** IsViewRenderStatement narrows a semantic node to a keyworded view render. */
export function IsViewRenderStatement(node: AST.Node): node is AST.ViewRenderStatement {
  return AST.IsKind(node, ['RenderInjectStatement', 'RenderViewExpressionStatement'])
}

type ImportStatement = AST.UseStatement | AST.UsePackageStatement

function isImportStatement(node: AST.Node): node is ImportStatement {
  return IsUseStatement(node) || IsUsePackageStatement(node)
}

function appendNestedViews(view: AST.ViewDeclaration, views: AST.ViewDeclaration[]): void {
  views.push(view)
  for (const statement of GetViewDeclarationStatements(view) ?? []) {
    if (IsViewDeclaration(statement)) {
      appendNestedViews(statement, views)
    }
  }
}

function isTestStep(node: AST.Statement): node is AST.TestStep {
  return AST.IsKind(node, ['RunStatement', 'PressStatement', 'TypeStatement', 'ExpectStatement'])
}

function isViewDeclarationStatement(node: AST.Statement): node is AST.ViewDeclarationStatement {
  return IsViewDeclaration(node) || IsViewRenderStatement(node) || IsLetDeclaration(node)
}

function isViewRenderBlockStatement(node: AST.Statement): node is AST.ViewRenderBlockStatement {
  return IsViewRenderExpression(node) || IsLetDeclaration(node)
}
