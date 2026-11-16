import { Range, Regxs, Source } from '@shared'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { isRuntimeFunctionNode } from './source-conformance-functions'

/** functionBodyLineCount counts non-brace-only physical lines in a function body. */
export function functionBodyLineCount(
  body: TypeScript.ConciseBody,
  source: string,
  file: TypeScript.SourceFile,
): number {
  const first = file.getLineAndCharacterOfPosition(body.getStart(file)).line
  const last = file.getLineAndCharacterOfPosition(body.getEnd() - 1).line
  const lineStarts = file.getLineStarts()
  let count = 0
  for (let index = first; index <= last; index++) {
    if (TypeScript.isBlock(body) && isBraceOnlyLine(body, source, lineStarts, index, first, last)) {
      continue
    }
    count++
  }
  return count
}

/** functionBody extracts the concise body of a function-like syntax node. */
export function functionBody(node: TypeScript.Node): TypeScript.ConciseBody | undefined {
  if (isRuntimeFunctionNode(node)) {
    return node.body
  }
}

/** singleLineImportIssue reports import declarations that span physical lines. */
export function singleLineImportIssue(
  node: TypeScript.ImportDeclaration,
  file: TypeScript.SourceFile,
): string | undefined {
  const firstLine = file.getLineAndCharacterOfPosition(node.getStart(file)).line
  const lastLine = file.getLineAndCharacterOfPosition(node.getEnd() - 1).line
  return firstLine === lastLine
    ? undefined
    : 'import declarations must fit on one line; use a namespace import for long lists'
}

const MultilineStringMessage = 'multiline strings must use S from @shared'

/** multilineStringIssue reports multiline runtime literals that violate S layout. */
export function multilineStringIssue(node: TypeScript.Node, file: TypeScript.SourceFile): string | undefined {
  if (!isRuntimeString(node)) {
    return
  }
  const layout = stringLayout(node, file)
  if (!Regxs.NewlineCharacter.test(layout)) {
    if (hasEscapedMultilineText(node) && !isIndependentTestExpectation(node, file)) {
      return MultilineStringMessage
    }
    return
  }
  if (!isSTemplate(node)) {
    return MultilineStringMessage
  }
  const lines = layout.split(Regxs.OptionalCarriageNewline)
  const opening =
    Source.slice(file.text, Source.lineStartBefore(file.text, node.getStart(file)), node.getStart(file)).match(
      Regxs.LeadingHorizontalWhitespaceRegx,
    )![0]
  const closing = lines[lines.length - 1]
  if (invalidSLayout(lines, opening, closing)) {
    return 'S content must start on a new line, be indented, and end with an aligned closing delimiter'
  }
}

type RuntimeString = TypeScript.StringLiteralLike | TypeScript.TemplateExpression
type InterpolationStart = TypeScript.TemplateHead | TypeScript.TemplateMiddle

function hasEscapedMultilineText(node: RuntimeString): boolean {
  if (TypeScript.isTaggedTemplateExpression(node.parent)) {
    return false
  }
  const text = cookedStringText(node)
  if (!Regxs.NewlineCharacter.test(text)) {
    return false
  }
  return text.split(Regxs.OptionalCarriageNewline).filter(line => line.trim()).length > 1
}

function cookedStringText(node: RuntimeString): string {
  if (TypeScript.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map(span => span.literal.text).join('')
  }
  return node.text
}

const ExpectedValueMatchers = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toContain', 'toMatchObject', 'toEndWith'])

function isIndependentTestExpectation(node: RuntimeString, file: TypeScript.SourceFile): boolean {
  const testFile = file.fileName.endsWith('.test.ts') || file.fileName.endsWith('.test.tsx')
  if (!testFile) {
    return false
  }
  let value: TypeScript.Node = node
  while (value.parent && !TypeScript.isCallExpression(value.parent)) {
    if (TypeScript.isFunctionLike(value.parent)) {
      return false
    }
    value = value.parent
  }
  const call = value.parent
  if (!call || !TypeScript.isCallExpression(call) || !call.arguments.some(argument => argument === value)) {
    return false
  }
  return TypeScript.isPropertyAccessExpression(call.expression)
    && ExpectedValueMatchers.has(call.expression.name.text)
}

function isBraceOnlyLine(
  body: TypeScript.Block,
  source: string,
  lineStarts: readonly number[],
  index: number,
  first: number,
  last: number,
): boolean {
  if (index === first && index === last) {
    return isBlankSpan(source, body.getStart() + 1, body.getEnd() - 1)
  }
  const lineStart = lineStarts[index]
  const lineEnd = lineStarts[index + 1] ?? source.length
  if (index === first) {
    return isBlankSpan(source, body.getStart() + 1, lineEnd)
  }
  return index === last && isBlankSpan(source, lineStart, body.getEnd() - 1)
}

function isBlankSpan(source: string, start: number, end: number): boolean {
  return Source.slice(source, start, end).trim() === ''
}

function isRuntimeString(node: TypeScript.Node): node is RuntimeString {
  return (TypeScript.isStringLiteralLike(node) || TypeScript.isTemplateExpression(node))
    && !TypeScript.isLiteralTypeNode(node.parent)
}

function isSTemplate(node: TypeScript.Node): boolean {
  return TypeScript.isTaggedTemplateExpression(node.parent) && isStringTemplateTag(node.parent.tag)
}

function isStringTemplateTag(tag: TypeScript.LeftHandSideExpression): boolean {
  if (TypeScript.isIdentifier(tag)) {
    return tag.text === 'S'
  }
  return TypeScript.isPropertyAccessExpression(tag) && tag.name.text === 'S'
}

function invalidSLayout(lines: string[], opening: string, closing: string): boolean {
  return lines[0] !== '`' || closing !== opening + '`'
    || lines.slice(1, -1).some(line => line.trim() && !line.startsWith(opening + '  '))
}

function stringLayout(
  node: RuntimeString,
  file: TypeScript.SourceFile,
): string {
  let layout = node.getText(file)
  if (!TypeScript.isTemplateExpression(node)) {
    return layout
  }
  const ranges: Range[] = []
  let previous: InterpolationStart = node.head
  for (const span of node.templateSpans) {
    const rangeStart = templateInterpolationStart(previous, node.getStart(file))
    const rangeEnd = templateInterpolationEnd(span.literal.getStart(file), node.getStart(file))
    ranges.push(Range(rangeStart, rangeEnd))
    if (TypeScript.isTemplateMiddle(span.literal)) {
      previous = span.literal
    }
  }
  for (const range of ranges.reverse()) {
    layout = Source.replace(layout, range, 'x')
  }
  return layout
}

function templateInterpolationStart(
  previous: InterpolationStart,
  templateStart: number,
): number {
  return previous.end - 2 - templateStart
}

function templateInterpolationEnd(literalStart: number, templateStart: number): number {
  return literalStart + 1 - templateStart
}
