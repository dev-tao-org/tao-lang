import type Parser from 'tree-sitter'
import type * as Nodes from './AST'
import * as AST from './Construction'

/** UseStatement constructs selected or wildcard declaration imports. */
export function UseStatement(cst: Parser.SyntaxNode): Nodes.UseStatement {
  const from = cst.childForFieldName('from')
  return AST.Node(cst, 'UseStatement', {
    imports: cst.childrenForFieldName('imports').map(child => AST.Construct(child, 'NamedImport')),
    ...(from ? { from: AST.Construct(from, 'ImportPath') } : {}),
    all: cst.childForFieldName('all') !== null,
  })
}

/** UsePackageStatement constructs a package namespace import. */
export function UsePackageStatement(cst: Parser.SyntaxNode): Nodes.UsePackageStatement {
  const alias = cst.childForFieldName('alias')
  return AST.Node(cst, 'UsePackageStatement', {
    from: AST.Field(cst, 'from', 'ImportPath'),
    ...(alias ? { alias: AST.Name(alias) } : {}),
  })
}

/** RequiresDeclaration constructs an authored dependency requirement. */
export function RequiresDeclaration(cst: Parser.SyntaxNode): Nodes.RequiresDeclaration {
  const version = cst.childForFieldName('version')
  const alias = cst.childForFieldName('alias')
  return AST.Node(cst, 'RequiresDeclaration', {
    provider: AST.RequiredField(cst, 'provider').text as Nodes.RequiresDeclaration['provider'],
    identifier: AST.RequiredField(cst, 'identifier').text,
    ...(version ? { version: version.text } : {}),
    ...(alias ? { alias: AST.Name(alias) } : {}),
  })
}

/** NamedImport constructs a declaration selector and optional local alias. */
export function NamedImport(cst: Parser.SyntaxNode): Nodes.NamedImport {
  const alias = cst.childForFieldName('alias')
  return AST.Node(cst, 'NamedImport', {
    target: AST.Field(cst, 'target', 'Name'),
    ...(alias ? { alias: AST.Name(alias) } : {}),
  })
}

/** ImportPath constructs a semantic module path. */
export function ImportPath(cst: Parser.SyntaxNode): Nodes.ImportPath {
  return AST.Node(cst, 'ImportPath', { value: cst.text })
}

/** QualifiedName normalizes identifier segments while preserving the authored source range. */
export function QualifiedName(cst: Parser.SyntaxNode): Nodes.Name {
  return AST.Name(cst)
}
