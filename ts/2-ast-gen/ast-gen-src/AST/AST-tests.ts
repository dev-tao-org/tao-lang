import * as CST from '@cst'
import * as AST from '../AST'

/** RenderTag identifies one authored render occurrence for interaction tests. */
export type RenderTag = AST.Semantic<'RenderTag', { value: string }>

/** TestsDeclaration groups app journeys under an optional label. */
export type TestsDeclaration = AST.Semantic<'TestsDeclaration', {
  label: AST.TextLiteral | undefined
  tests: readonly TestDeclaration[]
}>

/** TestDeclaration contains one isolated app journey. */
export type TestDeclaration = AST.Semantic<
  'TestDeclaration',
  { label: AST.TextLiteral | undefined; steps: readonly AST.TestStep[] }
>

/** RunStatement launches an app declaration in a fresh test session. */
export type RunStatement = AST.Semantic<'RunStatement', { app: AST.Name }>

/** PressStatement activates one tagged render. */
export type PressStatement = AST.Semantic<'PressStatement', { target: RenderTag }>

/** TypeStatement replaces a tagged input's current text. */
export type TypeStatement = AST.Semantic<'TypeStatement', { target: RenderTag; value: AST.TextLiteral }>

/** ExpectStatement groups visible assertions under an optional tagged render. */
export type ExpectStatement = AST.Semantic<'ExpectStatement', {
  target: RenderTag | undefined
  expectations: readonly AST.Expectation[]
}>

/** TextExpectation matches exact visible text. */
export type TextExpectation = AST.Semantic<'TextExpectation', { value: AST.TextLiteral }>

/** InputExpectation checks a tagged input's current value. */
export type InputExpectation = AST.Semantic<'InputExpectation', {
  target: RenderTag | undefined
  value: AST.TextLiteral
}>

/** TestsDeclaration constructs a labeled group of app journeys. */
export function TestsDeclaration(cst: CST.SyntaxNode): TestsDeclaration {
  return AST.Node(cst, 'TestsDeclaration', {
    label: optionalText(cst, 'label'),
    tests: cst.namedChildren.filter(child => child.type === 'TestDeclaration').map(AST.TestDeclaration),
  })
}

/** TestDeclaration constructs one app journey's ordered steps. */
export function TestDeclaration(cst: CST.SyntaxNode): TestDeclaration {
  return AST.Node(cst, 'TestDeclaration', {
    label: optionalText(cst, 'label'),
    steps: cst.namedChildren.filter(child => child.type !== 'TextLiteral' && CST.IsSemanticNode(child)).map(child =>
      AST.Construct(child, ['RunStatement', 'PressStatement', 'TypeStatement', 'ExpectStatement'])
    ),
  })
}

/** RunStatement constructs a named app launch. */
export function RunStatement(cst: CST.SyntaxNode): RunStatement {
  return AST.Node(cst, 'RunStatement', { app: AST.Field(cst, 'app', 'Name') })
}

/** PressStatement constructs a tagged control activation. */
export function PressStatement(cst: CST.SyntaxNode): PressStatement {
  return AST.Node(cst, 'PressStatement', { target: AST.Field(cst, 'target', 'RenderTag') })
}

/** TypeStatement constructs a tagged input replacement. */
export function TypeStatement(cst: CST.SyntaxNode): TypeStatement {
  return AST.Node(cst, 'TypeStatement', {
    target: AST.Field(cst, 'target', 'RenderTag'),
    value: AST.Field(cst, 'value', 'TextLiteral'),
  })
}

/** ExpectStatement constructs direct or grouped visible assertions. */
export function ExpectStatement(cst: CST.SyntaxNode): ExpectStatement {
  const target = cst.childForFieldName('target')
  return AST.Node(cst, 'ExpectStatement', {
    target: target ? AST.RenderTag(target) : undefined,
    expectations: cst.namedChildren.filter(child => child.type !== 'RenderTag' && CST.IsSemanticNode(child)).map(
      child => AST.Construct(child, ['TextExpectation', 'InputExpectation']),
    ),
  })
}

/** TextExpectation constructs an exact visible-text assertion. */
export function TextExpectation(cst: CST.SyntaxNode): TextExpectation {
  return AST.Node(cst, 'TextExpectation', { value: AST.Field(cst, 'value', 'TextLiteral') })
}

/** InputExpectation constructs an input assertion with an explicit or inherited target. */
export function InputExpectation(cst: CST.SyntaxNode): InputExpectation {
  const target = cst.childForFieldName('target')
  return AST.Node(cst, 'InputExpectation', {
    target: target ? AST.RenderTag(target) : undefined,
    value: AST.Field(cst, 'value', 'TextLiteral'),
  })
}

/** RenderTag constructs a render selector without its syntax marker. */
export function RenderTag(cst: CST.SyntaxNode): RenderTag {
  return AST.Node(cst, 'RenderTag', { value: cst.text.slice(1) })
}

function optionalText(cst: CST.SyntaxNode, field: string): AST.TextLiteral | undefined {
  const child = cst.childForFieldName(field)
  return child ? AST.TextLiteral(child) : undefined
}
