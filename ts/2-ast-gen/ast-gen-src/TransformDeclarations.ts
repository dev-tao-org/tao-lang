import type Parser from 'tree-sitter'
import type * as Nodes from './AST'
import * as AST from './Construction'

/** File constructs the semantic declaration list for one source file. */
export function File(cst: Parser.SyntaxNode): Nodes.File {
  return AST.Node(cst, 'File', { declarations: AST.List(cst, ['AppDeclaration', 'ViewDeclaration']) })
}

/** AppDeclaration constructs an app and its unresolved root view. */
export function AppDeclaration(cst: Parser.SyntaxNode): Nodes.AppDeclaration {
  return AST.Node(cst, 'AppDeclaration', {
    name: AST.Field(cst, 'name', 'Name'),
    root: AST.Field(AST.RequiredChild(cst, 'RootDeclaration'), 'view', 'Name'),
  })
}

/** Parameter constructs an authored parameter and its unresolved type. */
export function Parameter(cst: Parser.SyntaxNode): Nodes.Parameter {
  return AST.Node(cst, 'Parameter', { name: AST.Field(cst, 'name', 'Name'), type: AST.Field(cst, 'type', 'Name') })
}
