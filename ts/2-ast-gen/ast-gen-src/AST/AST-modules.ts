import * as CST from '@cst'
import * as AST from '../AST'

/** UseStatement imports declarations from an optional path or imports every declaration from one path. */
export type UseStatement = AST.Semantic<'UseStatement', {
  imports: readonly NamedImport[]
  from: ImportPath | undefined
  all: boolean
}>

/** UsePackageStatement imports a package under an optional namespace alias. */
export type UsePackageStatement = AST.Semantic<'UsePackageStatement', { from: ImportPath; alias: AST.Name | undefined }>

/** RequiresDeclaration records one authored package or file dependency. */
export type RequiresDeclaration = AST.Semantic<'RequiresDeclaration', {
  provider: 'github' | 'file' | 'npm' | 'bundled'
  identifier: string
  version: string | undefined
  alias: AST.Name | undefined
}>

/** NamedImport selects one declaration with an optional local alias. */
export type NamedImport = AST.Semantic<'NamedImport', { target: AST.Name; alias: AST.Name | undefined }>

/** ImportPath preserves an authored module path. */
export type ImportPath = AST.Semantic<'ImportPath', { value: string }>

/** UseStatement constructs selected or wildcard declaration imports. */
export function UseStatement(cst: CST.SyntaxNode): UseStatement {
  return AST.Node(cst, 'UseStatement', {
    imports: AST.FieldList(cst, 'imports', 'NamedImport'),
    from: AST.OptionalField(cst, 'from', 'ImportPath'),
    all: cst.childForFieldName('all') !== null,
  })
}

/** UsePackageStatement constructs a package namespace import. */
export function UsePackageStatement(cst: CST.SyntaxNode): UsePackageStatement {
  return AST.Node(cst, 'UsePackageStatement', {
    from: AST.Field(cst, 'from', 'ImportPath'),
    alias: AST.OptionalField(cst, 'alias', 'Name'),
  })
}

/** RequiresDeclaration constructs an authored dependency requirement. */
export function RequiresDeclaration(cst: CST.SyntaxNode): RequiresDeclaration {
  const version = cst.childForFieldName('version')
  return AST.Node(cst, 'RequiresDeclaration', {
    provider: CST.RequiredField(cst, 'provider').text as RequiresDeclaration['provider'],
    identifier: CST.RequiredField(cst, 'identifier').text,
    version: version?.text,
    alias: AST.OptionalField(cst, 'alias', 'Name'),
  })
}

/** NamedImport constructs a declaration selector and optional local alias. */
export function NamedImport(cst: CST.SyntaxNode): NamedImport {
  return AST.Node(cst, 'NamedImport', {
    target: AST.Field(cst, 'target', 'Name'),
    alias: AST.OptionalField(cst, 'alias', 'Name'),
  })
}

/** ImportPath constructs a semantic module path. */
export function ImportPath(cst: CST.SyntaxNode): ImportPath {
  return AST.Node(cst, 'ImportPath', { value: cst.text })
}

/** QualifiedName normalizes identifier segments while preserving the authored source range. */
export function QualifiedName(cst: CST.SyntaxNode): AST.Name {
  return AST.Name(cst)
}
