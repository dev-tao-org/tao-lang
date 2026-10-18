import type Parser from 'tree-sitter'
import type * as Nodes from './AST'
import * as AST from './Construction'

/** ViewDeclaration constructs a view and its render body. */
export function ViewDeclaration(cst: Parser.SyntaxNode): Nodes.ViewDeclaration {
  const parameters = cst.childForFieldName('parameters')
  return AST.Node(cst, 'ViewDeclaration', {
    name: AST.Field(cst, 'name', 'Name'),
    parameters: parameters ? AST.List(parameters, ['Parameter']) : [],
    render: AST.Field(AST.RequiredChild(cst, 'RenderStatement'), 'body', ['ViewRender', 'Injection']),
  })
}

/** ViewRender constructs a view invocation with arguments and child renders. */
export function ViewRender(cst: Parser.SyntaxNode): Nodes.ViewRender {
  const argumentsNode = cst.childForFieldName('argumentList')
  return AST.Node(cst, 'ViewRender', {
    target: AST.Field(cst, 'view', 'Name'),
    arguments: argumentsNode ? AST.List(argumentsNode, ['Name', 'TextLiteral']) : [],
    children: cst.childrenForFieldName('children').map(child => AST.Construct(child, 'ViewRender')),
  })
}

/** Injection constructs an opaque TypeScript body and its capture bindings. */
export function Injection(cst: Parser.SyntaxNode): Nodes.Injection {
  return AST.Node(cst, 'Injection', {
    captures: cst.namedChildren.filter(child => child.type === 'InjectionCapture').map(child =>
      AST.Construct(child, 'Capture')
    ),
    code: AST.RequiredField(cst, 'code').text.slice(5, -3).trim(),
  })
}

/** Capture constructs a native binding and its Tao value or contextual reference. */
export function Capture(cst: Parser.SyntaxNode): Nodes.Capture {
  const name = AST.Field(cst, 'name', 'Name')
  const value = cst.childForFieldName('value')
  return AST.Node(cst, 'Capture', { name, value: value ? AST.Construct(value, ['Name', 'ContextReference']) : name })
}

/** ContextReference constructs an unresolved contextual capture such as @@children. */
export function ContextReference(cst: Parser.SyntaxNode): Nodes.ContextReference {
  return AST.Node(cst, 'ContextReference', { value: cst.text.slice(2) })
}

/** TextLiteral constructs a decoded authored text value. */
export function TextLiteral(cst: Parser.SyntaxNode): Nodes.TextLiteral {
  return AST.Node(cst, 'TextLiteral', { value: JSON.parse(cst.text) as string })
}
