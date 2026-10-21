import type Parser from 'tree-sitter'
import * as AST from '../AST'

/** File contains the declarations in one source snapshot. */
export type File = AST.Semantic<'File', { declarations: readonly AST.Declaration[] }>

/** AppDeclaration names an app and its unresolved root view. */
export type AppDeclaration = AST.Semantic<'AppDeclaration', {
  name: AST.Name
  root: AST.Name
  visibility?: AST.Visibility
}>

/** Parameter preserves an authored parameter name and unresolved type. */
export type Parameter = AST.Semantic<'Parameter', { name: AST.Name; type: AST.Name }>

/** LetDefinition binds a value in its containing lexical scope. */
export type LetDefinition = AST.Semantic<'LetDefinition', {
  name: AST.Name
  type?: AST.Name
  value: AST.Expression
  visibility?: AST.Visibility
}>

/** File constructs the semantic declaration list for one source file. */
export function File(cst: Parser.SyntaxNode): File {
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
export function AppDeclaration(cst: Parser.SyntaxNode): AppDeclaration {
  const visibility = AST.OptionalVisibility(cst)
  return AST.Node(cst, 'AppDeclaration', {
    name: AST.Field(cst, 'name', 'Name'),
    root: AST.Field(AST.RequiredChild(cst, 'RootDeclaration'), 'view', 'Name'),
    ...(visibility ? { visibility } : {}),
  })
}

/** Parameter constructs an authored parameter and its unresolved type. */
export function Parameter(cst: Parser.SyntaxNode): Parameter {
  return AST.Node(cst, 'Parameter', { name: AST.Field(cst, 'name', 'Name'), type: AST.Field(cst, 'type', 'Name') })
}

/** LetDefinition constructs an ordered lexical value binding. */
export function LetDefinition(cst: Parser.SyntaxNode): LetDefinition {
  const type = cst.childForFieldName('type')
  const visibility = AST.OptionalVisibility(cst)
  return AST.Node(cst, 'LetDefinition', {
    name: AST.Field(cst, 'name', 'Name'),
    ...(type ? { type: AST.Name(type) } : {}),
    value: AST.Field(cst, 'value', ['Name', 'TextLiteral']),
    ...(visibility ? { visibility } : {}),
  })
}
