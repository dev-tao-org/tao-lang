import type { Tree } from '@grammar/CST'
import { Timings } from '@shared'
import { Formatting } from './format/Formatting'
import { Layout } from './format/Layout'
import { formattingPlan } from './lib/formatter/Formatter'
import { layout, type LayoutOptions } from './lib/layout/Layout'
import { applyEdits, type SourceEdit, type SourceRange } from './Source'

export type { SourceEdit } from './Source'

/** FormatInput pairs source text with the CST parsed from that exact immutable snapshot. */
export type FormatInput = { source: string; tree: Tree }

/** FormatResult returns formatted source and edits, leaving invalid syntax untouched. */
export type FormatResult = {
  status: 'formatted' | 'partial' | 'invalid'
  text: string
  edits: readonly SourceEdit[]
  skipped: readonly SourceRange[]
}

/** format proposes whitespace edits for one parsed Tao source without file access or mutation. */
export function format(
  input: FormatInput,
  timings = new Timings('formatter'),
  options: LayoutOptions = {},
): FormatResult {
  return formatSource(timings, input, options, timings)
}

const formatSource = Timings.measure('formatter.format', function(
  input: FormatInput,
  options: LayoutOptions,
  timings: Timings,
): FormatResult {
  if (input.tree.rootNode.type !== 'SourceFile') {
    return { status: 'invalid', text: input.source, edits: [], skipped: [{ start: 0, end: input.source.length }] }
  }
  const plan = formattingPlan(input.source, input.tree, Formatting, Layout, timings)
  const edits = layout(plan, options, timings)
  const status = plan.skipped.length === 0
    ? 'formatted'
    : input.tree.rootNode.hasError && edits.length === 0
    ? 'invalid'
    : 'partial'
  return { status, text: applyEdits(input.source, edits), edits, skipped: plan.skipped }
})
