import { Timings } from '@shared'
import type { SourceEdit } from '../../Source'
import type { EmbeddedFormatter } from '../formatter/Embedded'
import type { Boundary, LayoutPlan, ListGroup } from './Plan'

/** LayoutOptions configures the soft line width and indentation used by source formatting. */
export type LayoutOptions = { width?: number; indent?: number; typescript?: EmbeddedFormatter }

/** layout resolves breakable lists and emits only changed whitespace boundaries. */
export function layout(plan: LayoutPlan, options: LayoutOptions, timings: Timings): SourceEdit[] {
  return timings.run(emitLayout, plan, options)
}

const emitLayout = Timings.measure('formatter.layout', function(
  timings,
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
    const token = plan.tokens[index]
    const text = formatToken(plan, index, options, timings)
    if (token && text !== token.text) {
      edits.push({ start: token.startIndex, end: token.endIndex, text })
    }
    column = advance(column, text)
  }
  return edits
})

function formatToken(plan: LayoutPlan, index: number, options: LayoutOptions, timings: Timings): string {
  const token = plan.tokens[index]
  if (!token) {
    return ''
  }
  if (token.type !== 'TypeScript' || !options.typescript) {
    return token.text
  }
  const level = plan.gaps[index]!.indent
  const body = timings.run(formatEmbedded, options.typescript, token.text.slice(5, -3), {
    indent: options.indent ?? 2,
    level: level + 1,
    width: options.width ?? 120,
    newline: plan.newline,
  })
  if (body === undefined) {
    plan.skipped.push({ start: token.startIndex, end: token.endIndex })
    return token.text
  }
  return '```ts' + plan.newline + body.trimEnd()
    + plan.newline + ' '.repeat(level * (options.indent ?? 2)) + '```'
}

const formatEmbedded = Timings.measured('formatter.typescript', function(
  formatter: EmbeddedFormatter,
  body: string,
  options: Parameters<EmbeddedFormatter>[1],
): string | undefined {
  return formatter(body, options)
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
  for (const index of group.breaks) {
    plan.gaps[index]!.lines = 1
  }
  for (let index = group.indentStart; index < group.indentEnd; index++) {
    plan.gaps[index]!.indent++
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
