import type { SyntaxNode, Tree } from '@cst'
import { Errors } from '@shared'
import type { SourceRange } from '../../Source'

/** Boundary records independent horizontal spacing and vertical layout constraints. */
export type Boundary = SourceRange & {
  spaces: number
  explicitSpace?: number
  lines: number
  explicitLines?: number
  indent: number
  editable: boolean
}

/** ListGroup identifies delimiters whose interior may break together. */
export type ListGroup = {
  first: number
  last: number
  preserve: boolean
  breaks: readonly number[]
  indentStart: number
  indentEnd: number
}

/** LayoutPlan holds source anchors and constraints shared by formatting and layout handlers. */
export type LayoutPlan = {
  source: string
  newline: string
  tokens: SyntaxNode[]
  gaps: Boundary[]
  bounds: Map<string, { first: number; last: number }>
  groups: ListGroup[]
  skipped: SourceRange[]
}

/** createPlan collects tokens once, protecting incomplete declarations and their adjoining gaps. */
export function createPlan(source: string, tree: Tree): LayoutPlan {
  const plan: LayoutPlan = {
    source,
    newline: source.includes('\r\n') ? '\r\n' : '\n',
    tokens: [],
    gaps: [],
    bounds: new Map(),
    groups: [],
    skipped: [],
  }
  const owners: number[] = []
  const valid: boolean[] = []
  for (const [index, node] of tree.rootNode.namedChildren.entries()) {
    valid[index] = isCompleteNode(node)
    if (!valid[index]) {
      plan.skipped.push({ start: node.startIndex, end: node.endIndex })
    }
    collect(plan, node, index, owners, valid[index]!)
  }
  buildGaps(plan, owners, valid, !tree.rootNode.hasError)
  return plan
}

/** isCompleteNode identifies CST nodes safe for formatting rules and editable layout gaps. */
export function isCompleteNode(node: SyntaxNode): boolean {
  return !node.hasError && !node.isMissing && node.type !== 'ERROR'
}

/** createNodeKey identifies the range and kind of a CST node within its owning snapshot. */
export function createNodeKey(node: SyntaxNode): string {
  return `${node.type}:${node.startIndex}:${node.endIndex}`
}

/** spaceAt sets horizontal spacing, rejecting contradictory explicit rules. */
export function spaceAt(plan: LayoutPlan, index: number, spaces: number): void {
  const gap = plan.gaps[index]
  if (!gap) {
    return
  }
  if (gap.explicitSpace !== undefined && gap.explicitSpace !== spaces) {
    Errors.ThrowShouldNeverHappen(`Conflicting spacing rules at ${gap.start}.`)
  }
  gap.spaces = spaces
  if (gap.explicitLines === undefined) {
    gap.lines = 0
  }
  gap.explicitSpace = spaces
}

/** linesAt sets an exact line boundary, rejecting contradictory layout rules. */
export function linesAt(plan: LayoutPlan, index: number, lines: number): void {
  const gap = plan.gaps[index]
  if (!gap) {
    return
  }
  if (gap.explicitLines !== undefined && gap.explicitLines !== lines) {
    Errors.ThrowShouldNeverHappen(`Conflicting layout rules at ${gap.start}.`)
  }
  gap.lines = lines
  gap.explicitLines = lines
}

function collect(plan: LayoutPlan, node: SyntaxNode, owner: number, owners: number[], valid: boolean): void {
  const first = plan.tokens.length
  if (valid && node.children.length > 0) {
    for (const child of node.children) {
      collect(plan, child, owner, owners, valid)
    }
  } else {
    plan.tokens.push(node)
    owners.push(owner)
  }
  plan.bounds.set(createNodeKey(node), { first, last: plan.tokens.length - 1 })
}

const NewlineCharacterGlobalRegx = /\n/g
const WhitespaceOnlyRegx = /^\s*$/

function buildGaps(plan: LayoutPlan, owners: readonly number[], valid: readonly boolean[], whole: boolean): void {
  for (let index = 0; index <= plan.tokens.length; index++) {
    const start = plan.tokens[index - 1]?.endIndex ?? 0
    const end = plan.tokens[index]?.startIndex ?? plan.source.length
    const original = plan.source.slice(start, end)
    const left = owners[index - 1]
    const right = owners[index]
    const interior = hasCompleteNeighbors(left, right, valid)
    plan.gaps.push({
      start,
      end,
      spaces: index === 0 || index === plan.tokens.length ? 0 : 1,
      lines: Math.min(2, (original.match(NewlineCharacterGlobalRegx) ?? []).length),
      indent: 0,
      editable: WhitespaceOnlyRegx.test(original) && Boolean(interior || whole),
    })
  }
}

type TokenOwner = number | undefined

function hasCompleteNeighbors(
  left: TokenOwner,
  right: TokenOwner,
  valid: readonly boolean[],
): boolean {
  return left !== undefined && right !== undefined && Boolean(valid[left] && valid[right])
}
