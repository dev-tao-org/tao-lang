import * as TypeScript from 'typescript'

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
  if (
    TypeScript.isFunctionDeclaration(node) || TypeScript.isFunctionExpression(node)
    || TypeScript.isArrowFunction(node) || TypeScript.isMethodDeclaration(node)
    || TypeScript.isConstructorDeclaration(node) || TypeScript.isGetAccessorDeclaration(node)
    || TypeScript.isSetAccessorDeclaration(node)
  ) {
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

/** multilineStringIssue reports multiline runtime literals that violate S layout. */
export function multilineStringIssue(node: TypeScript.Node, file: TypeScript.SourceFile): string | undefined {
  if (!isRuntimeString(node)) {
    return
  }
  const layout = stringLayout(node, file)
  if (!/[\r\n]/.test(layout)) {
    return
  }
  if (!isSTemplate(node)) {
    return 'multiline strings must use S from @shared'
  }
  const lines = layout.split(/\r?\n/)
  const opening =
    file.text.slice(file.text.lastIndexOf('\n', node.getStart(file)) + 1, node.getStart(file)).match(/^[\t ]*/)![0]
  const closing = lines[lines.length - 1]
  if (invalidSLayout(lines, opening, closing)) {
    return 'S content must start on a new line, be indented, and end with an aligned closing delimiter'
  }
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
    return source.slice(body.getStart() + 1, body.getEnd() - 1).trim() === ''
  }
  const lineStart = lineStarts[index]
  const lineEnd = lineStarts[index + 1] ?? source.length
  if (index === first) {
    return source.slice(body.getStart() + 1, lineEnd).trim() === ''
  }
  return index === last && source.slice(lineStart, body.getEnd() - 1).trim() === ''
}

function isRuntimeString(node: TypeScript.Node): node is TypeScript.StringLiteralLike | TypeScript.TemplateExpression {
  return (TypeScript.isStringLiteralLike(node) || TypeScript.isTemplateExpression(node))
    && !TypeScript.isLiteralTypeNode(node.parent)
}

function isSTemplate(node: TypeScript.Node): boolean {
  return TypeScript.isTaggedTemplateExpression(node.parent) && TypeScript.isIdentifier(node.parent.tag)
    && node.parent.tag.text === 'S'
}

function invalidSLayout(lines: string[], opening: string, closing: string): boolean {
  return lines[0] !== '`' || closing !== opening + '`'
    || lines.slice(1, -1).some(line => line.trim() && !line.startsWith(opening + '  '))
}

function stringLayout(
  node: TypeScript.StringLiteralLike | TypeScript.TemplateExpression,
  file: TypeScript.SourceFile,
): string {
  let layout = node.getText(file)
  if (!TypeScript.isTemplateExpression(node)) {
    return layout
  }
  const ranges: { start: number; end: number }[] = []
  let previous: TypeScript.TemplateHead | TypeScript.TemplateMiddle = node.head
  for (const span of node.templateSpans) {
    ranges.push({
      start: previous.end - 2 - node.getStart(file),
      end: span.literal.getStart(file) + 1 - node.getStart(file),
    })
    if (TypeScript.isTemplateMiddle(span.literal)) {
      previous = span.literal
    }
  }
  for (const range of ranges.reverse()) {
    layout = layout.slice(0, range.start) + 'x' + layout.slice(range.end)
  }
  return layout
}
