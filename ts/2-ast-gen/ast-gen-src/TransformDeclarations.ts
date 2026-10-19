import type Parser from 'tree-sitter'
import type * as Nodes from './AST'
import * as AST from './Construction'

/** File constructs the semantic declaration list for one source file. */
export function File(cst: Parser.SyntaxNode): Nodes.File {
  return AST.Node(cst, 'File', {
    declarations: AST.List(cst, [
      'AppDeclaration',
      'ViewDeclaration',
      'TestsDeclaration',
      'LetDefinition',
      'UseStatement',
      'UsePackageStatement',
      'RequiresDeclaration',
    ]),
  })
}

/** AppDeclaration constructs an app and its unresolved root view. */
export function AppDeclaration(cst: Parser.SyntaxNode): Nodes.AppDeclaration {
  const visibility = AST.OptionalVisibility(cst)
  return AST.Node(cst, 'AppDeclaration', {
    name: AST.Field(cst, 'name', 'Name'),
    root: AST.Field(AST.RequiredChild(cst, 'RootDeclaration'), 'view', 'Name'),
    ...(visibility ? { visibility } : {}),
  })
}

/** Parameter constructs an authored parameter and its unresolved type. */
export function Parameter(cst: Parser.SyntaxNode): Nodes.Parameter {
  return AST.Node(cst, 'Parameter', { name: AST.Field(cst, 'name', 'Name'), type: AST.Field(cst, 'type', 'Name') })
}

/** LetDefinition constructs an ordered lexical value binding. */
export function LetDefinition(cst: Parser.SyntaxNode): Nodes.LetDefinition {
  const type = cst.childForFieldName('type')
  const visibility = AST.OptionalVisibility(cst)
  return AST.Node(cst, 'LetDefinition', {
    name: AST.Field(cst, 'name', 'Name'),
    ...(type ? { type: AST.Name(type) } : {}),
    value: AST.Field(cst, 'value', ['Name', 'TextLiteral']),
    ...(visibility ? { visibility } : {}),
  })
}
