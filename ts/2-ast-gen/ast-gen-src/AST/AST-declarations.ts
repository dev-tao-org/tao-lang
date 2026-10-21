import * as CST from '@cst'
import * as AST from '../AST'

/** File contains the declarations in one source snapshot. */
export type File = AST.Semantic<'File', { declarations: readonly AST.Declaration[] }>

/** AppDeclaration names an app and its unresolved root view. */
export type AppDeclaration = AST.Semantic<'AppDeclaration', {
  name: AST.Name
  root: AST.Name
  visibility: AST.Visibility | undefined
}>

/** Parameter preserves an authored parameter name and unresolved type. */
export type Parameter = AST.Semantic<'Parameter', { name: AST.Name; type: AST.Name }>

/** LetDefinition binds a value in its containing lexical scope. */
export type LetDefinition = AST.Semantic<'LetDefinition', {
  name: AST.Name
  type: AST.Name | undefined
  value: AST.Expression
  visibility: AST.Visibility | undefined
}>

/** File constructs the semantic declaration list for one source file. */
export function File(cst: CST.SyntaxNode): File {
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
export function AppDeclaration(cst: CST.SyntaxNode): AppDeclaration {
  const visibility = AST.OptionalVisibility(cst)
  return AST.Node(cst, 'AppDeclaration', {
    name: AST.Field(cst, 'name', 'Name'),
    root: AST.Field(CST.RequiredChild(cst, 'RootDeclaration'), 'view', 'Name'),
    visibility,
  })
}

/** Parameter constructs an authored parameter and its unresolved type. */
export function Parameter(cst: CST.SyntaxNode): Parameter {
  return AST.Node(cst, 'Parameter', { name: AST.Field(cst, 'name', 'Name'), type: AST.Field(cst, 'type', 'Name') })
}

/** LetDefinition constructs an ordered lexical value binding. */
export function LetDefinition(cst: CST.SyntaxNode): LetDefinition {
  const visibility = AST.OptionalVisibility(cst)
  return AST.Node(cst, 'LetDefinition', {
    name: AST.Field(cst, 'name', 'Name'),
    type: AST.OptionalField(cst, 'type', 'Name'),
    value: AST.Field(cst, 'value', ['Name', 'TextLiteral']),
    visibility,
  })
}
