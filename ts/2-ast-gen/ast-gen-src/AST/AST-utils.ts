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

/** GetAppDeclarations lists app declarations in a source document. */
export function GetAppDeclarations(document: AST.Document): AST.AppDeclaration[] {
  return GetDeclarations(document).filter(IsAppDeclaration)
}

/** GetDeclarations returns a document's declarations without copying or filtering them. */
export function GetDeclarations(document: AST.Document): readonly AST.Declaration[] {
  return getBlockDeclarations(document.root.block)
}

/** GetAppRoot returns the one app root view name. */
export function GetAppRoot(app: AST.AppDeclaration): AST.Name {
  const root = app.block.statements[0]
  if (!root) {
    Errors.ThrowShouldNeverHappen('An app declaration has no root view.')
  }
  return root.view
}

/** GetTestSteps returns one test's ordered interaction and assertion steps. */
export function GetTestSteps(test: AST.TestDeclaration): readonly AST.TestStep[] {
  return test.block.statements
}

/** GetViewDeclarationStatements returns view declarations in authored order, if implemented in Tao. */
export function GetViewDeclarationStatements(
  view: AST.ViewDeclaration,
): readonly AST.ViewDeclarationStatement[] | undefined {
  return AST.IsKind(view.body, 'Block') ? view.body.statements : undefined
}

/** GetViewRenderBlockStatements returns nested render declarations in authored order. */
export function GetViewRenderBlockStatements(
  expression: AST.ViewRenderExpression,
): readonly AST.ViewRenderBlockStatement[] {
  return expression.block?.statements ?? []
}

/** HasAppDeclarations reports whether a source document declares an app. */
export function HasAppDeclarations(document: AST.Document): boolean {
  return GetDeclarations(document).some(IsAppDeclaration)
}

/** FindAppDeclaration finds one named app declaration in a source document. */
export function FindAppDeclaration(document: AST.Document, name: string): AST.AppDeclaration | undefined {
  return GetDeclarations(document).find(
    (declaration): declaration is AST.AppDeclaration =>
      IsAppDeclaration(declaration) && declaration.name.value === name,
  )
}

/** GetImportStatements lists declaration and package imports in a source document. */
export function GetImportStatements(document: AST.Document): (AST.UseStatement | AST.UsePackageStatement)[] {
  return GetDeclarations(document).filter(isImportStatement)
}

/** HasImportStatements reports whether a source document declares an import. */
export function HasImportStatements(document: AST.Document): boolean {
  return GetDeclarations(document).some(isImportStatement)
}

/** GetValueDeclarations lists named values declared by a source document. */
export function GetValueDeclarations(document: AST.Document): AST.ValueDeclaration[] {
  return GetDeclarations(document).filter(IsValueDeclaration)
}

/** GetViewDeclarations lists view declarations in a source document. */
export function GetViewDeclarations(document: AST.Document): AST.ViewDeclaration[] {
  return GetDeclarations(document).filter(IsViewDeclaration)
}

/** GetAllViewDeclarations lists top-level and private views in authored preorder. */
export function GetAllViewDeclarations(document: AST.Document): AST.ViewDeclaration[] {
  const views: AST.ViewDeclaration[] = []
  for (const declaration of GetDeclarations(document)) {
    if (IsViewDeclaration(declaration)) {
      appendNestedViews(declaration, views)
    }
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

function isImportStatement(node: AST.Node): node is AST.UseStatement | AST.UsePackageStatement {
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

function getBlockDeclarations(block: AST.DeclarationBlock): readonly AST.Declaration[] {
  return block.statements
}
