import type Parser from 'tree-sitter'
import type { SourceEdit } from './Format'

/** prefixEdits places declaration visibility and nested render tags above their following heads. */
export function prefixEdits(source: string, root: Parser.SyntaxNode): SourceEdit[] {
  const edits: SourceEdit[] = []
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const nodes = root.descendantsOfType(['AppDeclaration', 'ViewDeclaration', 'LetDefinition', 'ViewRender'])
  for (const node of nodes) {
    const visibility = node.childForFieldName('visibility')
    if (visibility) {
      prefixLines(source, visibility, newline, edits)
    }
    const tag = node.childForFieldName('tag')
    if (tag && node.parent?.type !== 'RenderStatement') {
      prefixLines(source, tag, newline, edits)
    }
  }
  return edits
}

function prefixLines(source: string, prefix: Parser.SyntaxNode, newline: string, edits: SourceEdit[]): void {
  const next = prefix.nextSibling
  if (!next) {
    return
  }
  const lineStart = source.lastIndexOf('\n', prefix.startIndex - 1) + 1
  const before = source.slice(lineStart, prefix.startIndex)
  const inline = /\S/.test(before)
  const indent = inline ? enclosingIndent(prefix) : before
  const text = newline + indent
  if (inline) {
    const whitespace = /[\t ]*$/.exec(before)![0]
    edits.push({ start: prefix.startIndex - whitespace.length, end: prefix.startIndex, text })
  }
  const gap = source.slice(prefix.endIndex, next.startIndex)
  if (gap !== text && /^\s*$/.test(gap)) {
    edits.push({ start: prefix.endIndex, end: next.startIndex, text })
  }
}

function enclosingIndent(prefix: Parser.SyntaxNode): string {
  let depth = 0
  for (let node = prefix.parent; node; node = node.parent) {
    if (node.children.some(child => child.type === '{' && child.startIndex < prefix.startIndex)) {
      depth++
    }
  }
  return '  '.repeat(depth)
}
