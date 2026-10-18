import { Timings } from '@shared'
import type Parser from 'tree-sitter'
import { prefixEdits } from './PrefixFormatting'

/** FormatInput pairs source text with the CST parsed from that exact immutable snapshot. */
export type FormatInput = { source: string; tree: Parser.Tree }

/** SourceEdit replaces one UTF-16 source range without retaining its CST nodes. */
export type SourceEdit = { start: number; end: number; text: string }

/** FormatResult returns formatted source and edits, leaving invalid syntax untouched. */
export type FormatResult = { status: 'formatted' | 'invalid'; text: string; edits: readonly SourceEdit[] }

/** format proposes whitespace edits for one parsed Tao source without file access or mutation. */
export function format(input: FormatInput, timings = new Timings('formatter')): FormatResult {
  return Format(timings, input)
}

const Format = Timings.measure('formatter.format', formatSource)

function formatSource(input: FormatInput): FormatResult {
  if (input.tree.rootNode.hasError) {
    return { status: 'invalid', text: input.source, edits: [] }
  }
  const edits = prefixEdits(input.source, input.tree.rootNode).sort((left, right) => left.start - right.start)
  return { status: 'formatted', text: applyEdits(input.source, edits), edits }
}

function applyEdits(source: string, edits: readonly SourceEdit[]): string {
  const parts: string[] = []
  let offset = 0
  for (const edit of edits) {
    parts.push(source.slice(offset, edit.start), edit.text)
    offset = edit.end
  }
  parts.push(source.slice(offset))
  return parts.join('')
}
