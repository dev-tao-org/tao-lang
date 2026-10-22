import type * as CST from '@cst'
import * as AST from '../AST'

/** Name preserves an authored identifier without resolving it. */
export type Name = AST.Semantic<'Name', { value: string }>

/** Name constructs a semantic identifier from its CST node. */
export function Name(cst: CST.SyntaxNode): AST.Name {
  const parts = cst.namedChildren.filter(child => child.type === 'Identifier')
  return AST.Node(cst, 'Name', { value: parts.length ? parts.map(child => child.text).join('.') : cst.text })
}

/** IsAppDeclaration narrows a semantic node to an app declaration. */
export function IsAppDeclaration(node: AST.Node): node is AST.AppDeclaration {
  return IsKind(node, 'AppDeclaration')
}

/** IsViewDeclaration narrows a semantic node to a view declaration. */
export function IsViewDeclaration(node: AST.Node): node is AST.ViewDeclaration {
  return IsKind(node, 'ViewDeclaration')
}

/** IsTestsDeclaration narrows a semantic node to an app-test suite. */
export function IsTestsDeclaration(node: AST.Node): node is AST.TestsDeclaration {
  return IsKind(node, 'TestsDeclaration')
}

/** IsLetDefinition narrows a semantic node to a lexical value definition. */
export function IsLetDefinition(node: AST.Node): node is AST.LetDefinition {
  return IsKind(node, 'LetDefinition')
}

/** IsValueDeclaration narrows a semantic node to a value declaration. */
export function IsValueDeclaration(node: AST.Node): node is AST.ValueDeclaration {
  return IsKind(node, ['AppDeclaration', 'ViewDeclaration', 'LetDefinition'])
}

/** GetAppDeclarations lists app declarations in a source document. */
export function GetAppDeclarations(document: AST.Document): AST.AppDeclaration[] {
  return GetDeclarations(document).filter(IsAppDeclaration)
}

/** GetDeclarations returns a document's declarations without copying or filtering them. */
export function GetDeclarations(document: AST.Document): readonly AST.Declaration[] {
  return document.root.declarations
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

/** HasViewDeclarations reports whether a source document declares a view. */
export function HasViewDeclarations(document: AST.Document): boolean {
  return GetDeclarations(document).some(IsViewDeclaration)
}

/** HasForeignViews reports whether a source document declares a foreign view. */
export function HasForeignViews(document: AST.Document): boolean {
  return GetDeclarations(document).some(declaration =>
    IsViewDeclaration(declaration) && GetForeignViewPath(declaration) !== undefined
  )
}

/** GetForeignViewPath returns a view's authored module path when its body is foreign. */
export function GetForeignViewPath(view: AST.ViewDeclaration): AST.ImportPath | undefined {
  return IsKind(view.render, 'ForeignView') ? view.render.path : undefined
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
  return IsKind(node, 'UseStatement')
}

/** IsUsePackageStatement narrows a semantic node to a package import. */
export function IsUsePackageStatement(node: AST.Node): node is AST.UsePackageStatement {
  return IsKind(node, 'UsePackageStatement')
}

/** IsViewRender narrows a semantic node to a view invocation. */
export function IsViewRender(node: AST.Node): node is AST.ViewRender {
  return IsKind(node, 'ViewRender')
}

/** IsInjection narrows a semantic node to an injection. */
export function IsInjection(node: AST.Node): node is AST.Injection {
  return IsKind(node, 'Injection')
}

/** IsKind narrows a semantic node to the requested discriminant or discriminants. */
export function IsKind<Kind extends AST.Node['kind']>(
  node: AST.Node,
  kind: Kind | readonly Kind[],
): node is AST.OfKind<Kind> {
  return typeof kind === 'string' ? node.kind === kind : kind.some(candidate => candidate === node.kind)
}

function isImportStatement(node: AST.Node): node is AST.UseStatement | AST.UsePackageStatement {
  return IsUseStatement(node) || IsUsePackageStatement(node)
}
