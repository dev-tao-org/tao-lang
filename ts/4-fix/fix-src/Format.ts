import type { Tree } from '@cst'
import { Range, Timings } from '@shared'
import { Formatting } from './format/Formatting'
import { Layout } from './format/Layout'
import { createFormattingPlan } from './lib/formatter/Formatter'
import { layout, type LayoutOptions } from './lib/layout/Layout'
import type { LayoutPlan } from './lib/layout/Plan'
import { applyEdits, type SourceEdit } from './Source'

export type { SourceEdit } from './Source'

/** FormatInput pairs source text with the CST parsed from that exact immutable snapshot. */
export type FormatInput = { source: string; tree: Tree }

/** FormatResult returns formatted source and edits, leaving invalid syntax untouched. */
export type FormatResult = {
  status: FormatStatus
  text: string
  edits: readonly SourceEdit[]
  skipped: readonly Range[]
}

/** format proposes whitespace edits for one parsed Tao source without file access or mutation. */
export const format = Timings.createTopLevelTimer(function(
  timings,
  input: FormatInput,
  options: LayoutOptions = {},
): FormatResult {
  return timings.run(formatSource, input, options)
})

type FormatStatus = 'formatted' | 'partial' | 'invalid'

const formatSource = Timings.measure('formatter.format', function(
  timings,
  input: FormatInput,
  options: LayoutOptions,
): FormatResult {
  if (input.tree.rootNode.type !== 'SourceFile') {
    return { status: 'invalid', text: input.source, edits: [], skipped: [Range(0, input.source.length)] }
  }
  const plan = createFormattingPlan(input.source, input.tree, Formatting, Layout, timings)
  const edits = layout(plan, options, timings)
  const status = resolveFormatStatus(input, plan, edits)
  return { status, text: applyEdits(input.source, edits), edits, skipped: plan.skipped }
})

function resolveFormatStatus(
  input: FormatInput,
  plan: LayoutPlan,
  edits: readonly SourceEdit[],
): FormatResult['status'] {
  if (plan.skipped.length === 0) {
    return 'formatted'
  }
  if (input.tree.rootNode.hasError && edits.length === 0) {
    return 'invalid'
  }
  return 'partial'
}
