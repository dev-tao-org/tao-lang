import type Parser from 'tree-sitter'
import type * as Nodes from './AST'
import * as AST from './Construction'

/** TestsDeclaration constructs a labeled group of app journeys. */
export function TestsDeclaration(cst: Parser.SyntaxNode): Nodes.TestsDeclaration {
  return AST.Node(cst, 'TestsDeclaration', {
    label: optionalText(cst, 'label'),
    tests: cst.namedChildren.filter(child => child.type === 'TestDeclaration').map(AST.TestDeclaration),
  })
}

/** TestDeclaration constructs one app journey's ordered steps. */
export function TestDeclaration(cst: Parser.SyntaxNode): Nodes.TestDeclaration {
  return AST.Node(cst, 'TestDeclaration', {
    label: optionalText(cst, 'label'),
    steps: cst.namedChildren.filter(child => child.type !== 'TextLiteral').map(child =>
      AST.Construct(child, ['RunStatement', 'PressStatement', 'TypeStatement', 'ExpectStatement'])
    ),
  })
}

/** RunStatement constructs a named app launch. */
export function RunStatement(cst: Parser.SyntaxNode): Nodes.RunStatement {
  return AST.Node(cst, 'RunStatement', { app: AST.Field(cst, 'app', 'Name') })
}

/** PressStatement constructs a tagged control activation. */
export function PressStatement(cst: Parser.SyntaxNode): Nodes.PressStatement {
  return AST.Node(cst, 'PressStatement', { target: AST.Field(cst, 'target', 'RenderTag') })
}

/** TypeStatement constructs a tagged input replacement. */
export function TypeStatement(cst: Parser.SyntaxNode): Nodes.TypeStatement {
  return AST.Node(cst, 'TypeStatement', {
    target: AST.Field(cst, 'target', 'RenderTag'),
    value: AST.Field(cst, 'value', 'TextLiteral'),
  })
}

/** ExpectStatement constructs direct or grouped visible assertions. */
export function ExpectStatement(cst: Parser.SyntaxNode): Nodes.ExpectStatement {
  const target = cst.childForFieldName('target')
  return AST.Node(cst, 'ExpectStatement', {
    target: target ? AST.RenderTag(target) : undefined,
    expectations: cst.namedChildren.filter(child => child.type !== 'RenderTag').map(child =>
      AST.Construct(child, ['TextExpectation', 'InputExpectation'])
    ),
  })
}

/** TextExpectation constructs an exact visible-text assertion. */
export function TextExpectation(cst: Parser.SyntaxNode): Nodes.TextExpectation {
  return AST.Node(cst, 'TextExpectation', { value: AST.Field(cst, 'value', 'TextLiteral') })
}

/** InputExpectation constructs an input assertion with an explicit or inherited target. */
export function InputExpectation(cst: Parser.SyntaxNode): Nodes.InputExpectation {
  const target = cst.childForFieldName('target')
  return AST.Node(cst, 'InputExpectation', {
    target: target ? AST.RenderTag(target) : undefined,
    value: AST.Field(cst, 'value', 'TextLiteral'),
  })
}

/** RenderTag constructs a render selector without its syntax marker. */
export function RenderTag(cst: Parser.SyntaxNode): Nodes.RenderTag {
  return AST.Node(cst, 'RenderTag', { value: cst.text.slice(1) })
}

function optionalText(cst: Parser.SyntaxNode, field: string): Nodes.TextLiteral | undefined {
  const child = cst.childForFieldName(field)
  return child ? AST.TextLiteral(child) : undefined
}
