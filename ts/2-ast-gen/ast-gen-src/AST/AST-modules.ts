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
  const from = cst.childForFieldName('from')
  return AST.Node(cst, 'UseStatement', {
    imports: cst.childrenForFieldName('imports').map(child => AST.Construct(child, 'NamedImport')),
    from: from ? AST.Construct(from, 'ImportPath') : undefined,
    all: cst.childForFieldName('all') !== null,
  })
}

/** UsePackageStatement constructs a package namespace import. */
export function UsePackageStatement(cst: CST.SyntaxNode): UsePackageStatement {
  const alias = cst.childForFieldName('alias')
  return AST.Node(cst, 'UsePackageStatement', {
    from: AST.Field(cst, 'from', 'ImportPath'),
    alias: alias ? AST.Name(alias) : undefined,
  })
}

/** RequiresDeclaration constructs an authored dependency requirement. */
export function RequiresDeclaration(cst: CST.SyntaxNode): RequiresDeclaration {
  const version = cst.childForFieldName('version')
  const alias = cst.childForFieldName('alias')
  return AST.Node(cst, 'RequiresDeclaration', {
    provider: CST.RequiredField(cst, 'provider').text as RequiresDeclaration['provider'],
    identifier: CST.RequiredField(cst, 'identifier').text,
    version: version?.text,
    alias: alias ? AST.Name(alias) : undefined,
  })
}

/** NamedImport constructs a declaration selector and optional local alias. */
export function NamedImport(cst: CST.SyntaxNode): NamedImport {
  const alias = cst.childForFieldName('alias')
  return AST.Node(cst, 'NamedImport', {
    target: AST.Field(cst, 'target', 'Name'),
    alias: alias ? AST.Name(alias) : undefined,
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
