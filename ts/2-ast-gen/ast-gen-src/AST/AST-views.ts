import type Parser from 'tree-sitter'
import * as AST from '../AST'

/** ViewDeclaration defines parameters and one render body. */
export type ViewDeclaration = AST.Semantic<'ViewDeclaration', {
  name: AST.Name
  visibility: AST.Visibility | undefined
  parameters: readonly AST.Parameter[]
  definitions: readonly AST.LetDefinition[]
  render: ViewRender | Injection | ForeignView
}>

/** ForeignView identifies a TypeScript module implementing a view declaration. */
export type ForeignView = AST.Semantic<'ForeignView', { path: AST.ImportPath }>

/** ViewRender invokes a view with positional arguments and child renders. */
export type ViewRender = AST.Semantic<'ViewRender', {
  tag: AST.RenderTag | undefined
  target: AST.Name
  arguments: readonly AST.Expression[]
  children: readonly (ViewRender | AST.LetDefinition)[]
}>

/** Injection preserves an opaque TypeScript body and explicit capture bindings. */
export type Injection = AST.Semantic<'Injection', { captures: readonly Capture[]; code: string }>

/** Capture binds a native local to a Tao value or contextual children. */
export type Capture = AST.Semantic<'Capture', { name: AST.Name; value: AST.Name | ContextReference }>

/** ContextReference preserves an unresolved contextual capture such as @@children. */
export type ContextReference = AST.Semantic<'ContextReference', { value: string }>

/** TextLiteral contains a decoded authored text value. */
export type TextLiteral = AST.Semantic<'TextLiteral', { value: string }>

/** ViewDeclaration constructs a view and its render body. */
export function ViewDeclaration(cst: Parser.SyntaxNode): ViewDeclaration {
  const parameters = cst.childForFieldName('parameters')
  const visibility = AST.OptionalVisibility(cst)
  return AST.Node(cst, 'ViewDeclaration', {
    name: AST.Field(cst, 'name', 'Name'),
    parameters: parameters ? AST.List(parameters, ['Parameter']) : [],
    definitions: cst.namedChildren.filter(child => child.type === 'LetDefinition')
      .map(child => AST.Construct(child, 'LetDefinition')),
    render: viewBody(cst),
    visibility,
  })
}

/** ForeignView constructs a module-backed view body. */
export function ForeignView(cst: Parser.SyntaxNode): ForeignView {
  return AST.Node(cst, 'ForeignView', { path: AST.Field(cst, 'path', 'ImportPath') })
}

/** ViewRender constructs a view invocation with arguments and child renders. */
export function ViewRender(cst: Parser.SyntaxNode): ViewRender {
  const argumentsNode = cst.childForFieldName('argumentList')
  const tag = cst.childForFieldName('tag')
  return AST.Node(cst, 'ViewRender', {
    tag: tag ? AST.RenderTag(tag) : undefined,
    target: AST.Field(cst, 'view', 'Name'),
    arguments: argumentsNode ? AST.List(argumentsNode, ['Name', 'TextLiteral']) : [],
    children: cst.childrenForFieldName('children').map(child => AST.Construct(child, ['ViewRender', 'LetDefinition'])),
  })
}

/** Injection constructs an opaque TypeScript body and its capture bindings. */
export function Injection(cst: Parser.SyntaxNode): Injection {
  return AST.Node(cst, 'Injection', {
    captures: cst.namedChildren.filter(child => child.type === 'InjectionCapture').map(child =>
      AST.Construct(child, 'Capture')
    ),
    code: AST.RequiredField(cst, 'code').text.slice(5, -3).trim(),
  })
}

/** Capture constructs a native binding and its Tao value or contextual reference. */
export function Capture(cst: Parser.SyntaxNode): Capture {
  const name = AST.Field(cst, 'name', 'Name')
  const value = cst.childForFieldName('value')
  return AST.Node(cst, 'Capture', { name, value: value ? AST.Construct(value, ['Name', 'ContextReference']) : name })
}

/** ContextReference constructs an unresolved contextual capture such as @@children. */
export function ContextReference(cst: Parser.SyntaxNode): ContextReference {
  return AST.Node(cst, 'ContextReference', { value: cst.text.slice(2) })
}

/** TextLiteral constructs a decoded authored text value. */
export function TextLiteral(cst: Parser.SyntaxNode): TextLiteral {
  return AST.Node(cst, 'TextLiteral', { value: JSON.parse(cst.text) as string })
}

function viewBody(cst: Parser.SyntaxNode): ViewDeclaration['render'] {
  const body = cst.namedChildren.find(child => child.type === 'ForeignView')
  return body
    ? AST.Construct(body, 'ForeignView')
    : AST.Field(AST.RequiredChild(cst, 'RenderStatement'), 'body', ['ViewRender', 'Injection'])
}
