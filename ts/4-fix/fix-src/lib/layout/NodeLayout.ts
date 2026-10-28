import * as CST from '@cst'
import type { Field, NodeType, SyntaxNode, Token } from '@cst'
import { NodeContext } from '../formatter/NodeFormat'
import { linesAt } from './Plan'

/** NodeLayout declares vertical boundaries and breakable groups through independent commands. */
export class NodeLayout<Kind extends NodeType> extends NodeContext<Kind> {
  blankLineBefore(node: SyntaxNode): void {
    linesAt(this.plan, this.range(node).first, 2)
  }

  lineBefore(node: SyntaxNode): void {
    linesAt(this.plan, this.range(node).first, 1)
  }

  newLineBefore(...tokens: Token<Kind>[]): void {
    for (const token of tokens) {
      for (const node of this.tokens(token)) {
        linesAt(this.plan, this.range(node).first, 1)
      }
    }
  }

  newLineAfter(...tokens: Token<Kind>[]): void {
    for (const token of tokens) {
      for (const node of this.tokens(token)) {
        linesAt(this.plan, this.range(node).last + 1, 1)
      }
    }
  }

  onOwnLineProperty(...properties: Field<Kind>[]): void {
    for (const name of properties) {
      const node = this.property(name)
      if (node) {
        const { first, last } = this.range(node)
        if (first > this.range(this.node).first) {
          linesAt(this.plan, first, 1)
        }
        linesAt(this.plan, last + 1, 1)
      }
    }
  }

  lineSeparated(items: readonly SyntaxNode[]): void {
    for (const node of items.slice(1)) {
      const first = this.range(node).first
      linesAt(this.plan, first, Math.max(1, this.plan.gaps[first]!.lines))
    }
  }

  block(): void {
    const open = this.node.children.find(child => child.type === '{')
    const close = this.node.children.find(child => child.type === '}')
    if (!open || !close) {
      return
    }
    const first = this.range(open).last + 1
    const last = this.range(close).first
    if (first === last) {
      this.plan.gaps[first]!.lines = 0
      return
    }
    linesAt(this.plan, first, 1)
    linesAt(this.plan, last, 1)
    for (let index = first; index < last; index++) {
      this.plan.gaps[index]!.indent++
    }
    const items = this.node.namedChildren.filter(node => isBlockItem(node, open, close))
    this.lineSeparated(items)
  }

  list(): void {
    const { first, last } = this.range(this.node)
    if (last > first + 1) {
      this.plan.groups.push({
        first,
        last,
        preserve: this.isMultiline() || this.hasComments(),
        breaks: [first + 1, ...this.commaBreaks(), last],
        indentStart: first + 1,
        indentEnd: last,
      })
    }
  }

  commaList(tail?: CommaListTail<Kind>): void {
    const breaks = this.commaBreaks()
    if (breaks.length === 0) {
      return
    }
    const { first, last } = this.range(this.node)
    const suffix = tail && (this.node.children.find(child => child.type === tail) ?? this.node.childForFieldName(tail))
    const end = suffix ? this.range(suffix).first : last + 1
    this.plan.groups.push({
      first,
      last: suffix?.type === 'TypeScript' ? end - 1 : last,
      preserve: this.plan.tokens.slice(first, end).some(node => CST.IsComment(node))
        || this.plan.source.slice(this.node.startIndex, this.plan.tokens[end - 1]!.endIndex).includes('\n'),
      breaks: [...breaks, ...suffix ? [end] : []],
      indentStart: first + 1,
      indentEnd: end,
    })
  }

  private commaBreaks(): number[] {
    return this.node.children.filter(node => node.type === ',').map(node => this.range(node).last + 1)
  }
}

type CommaListTail<Kind extends NodeType> = Token<Kind> | Field<Kind>

function isBlockItem(node: SyntaxNode, open: SyntaxNode, close: SyntaxNode): boolean {
  return node.startIndex >= open.endIndex && node.endIndex <= close.startIndex && !CST.IsComment(node)
}
