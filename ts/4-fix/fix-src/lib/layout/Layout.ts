import { Timings } from '@shared'
import type { SourceEdit } from '../../Source'
import type { Boundary, LayoutPlan, ListGroup } from './Plan'

/** LayoutOptions configures the soft line width and indentation used by source formatting. */
export type LayoutOptions = { width?: number; indent?: number }

/** layout resolves breakable lists and emits only changed whitespace boundaries. */
export function layout(plan: LayoutPlan, options: LayoutOptions, timings: Timings): SourceEdit[] {
  return emitLayout(timings, plan, options)
}

const emitLayout = Timings.measure('formatter.layout', function(
  plan: LayoutPlan,
  options: LayoutOptions,
): SourceEdit[] {
  const edits: SourceEdit[] = []
  const groups = new Map(plan.groups.map(group => [group.first, group]))
  const widths = flatWidths(plan)
  let column = 0
  for (let index = 0; index < plan.gaps.length; index++) {
    const gap = plan.gaps[index]!
    const whitespace = resolveGap(plan, gap, options.indent ?? 2)
    column = advance(column, whitespace)
    const group = groups.get(index)
    if (group && shouldBreak(plan, group, widths, column, options.width ?? 120)) {
      breakList(plan, group)
    }
    if (gap.editable && whitespace !== plan.source.slice(gap.start, gap.end)) {
      edits.push({ start: gap.start, end: gap.end, text: whitespace })
    }
    column = advance(column, plan.tokens[index]?.text ?? '')
  }
  return edits
})

function flatWidths(plan: LayoutPlan): number[] {
  const widths = [0]
  for (const [index, token] of plan.tokens.entries()) {
    widths.push(widths[index]! + [...token.text].length + plan.gaps[index + 1]!.spaces)
  }
  return widths
}

function shouldBreak(
  plan: LayoutPlan,
  group: ListGroup,
  widths: readonly number[],
  column: number,
  width: number,
): boolean {
  const flat = widths[group.last + 1]! - widths[group.first]! - plan.gaps[group.last + 1]!.spaces
  return group.preserve || column + flat > width
}

function breakList(plan: LayoutPlan, group: ListGroup): void {
  for (let index = group.first + 1; index <= group.last; index++) {
    const gap = plan.gaps[index]!
    gap.lines = index === group.first + 1 || index === group.last
        || plan.tokens[index - 1]?.type === ','
      ? 1
      : gap.lines
    if (index < group.last) {
      gap.indent++
    }
  }
}

function resolveGap(plan: LayoutPlan, gap: Boundary, indent: number): string {
  if (!gap.editable) {
    return plan.source.slice(gap.start, gap.end)
  }
  return gap.lines > 0
    ? plan.newline.repeat(gap.lines) + ' '.repeat(gap.indent * indent)
    : ' '.repeat(gap.spaces)
}

function advance(column: number, text: string): number {
  const newline = text.lastIndexOf('\n')
  return newline < 0 ? column + [...text].length : [...text.slice(newline + 1)].length
}
