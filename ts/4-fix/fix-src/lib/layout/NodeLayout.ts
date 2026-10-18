import type { Field, NodeType, SyntaxNode, Token } from '@grammar/CST'
import { NodeContext } from '../formatter/NodeFormat'
import { linesAt } from './Plan'

/** NodeLayout declares vertical boundaries and breakable groups for one typed CST rule. */
export class NodeLayout<Kind extends NodeType> extends NodeContext<Kind> {
  blankLineBefore(node: SyntaxNode): this {
    linesAt(this.plan, this.range(node).first, 2)
    return this
  }

  lineBefore(node: SyntaxNode): this {
    linesAt(this.plan, this.range(node).first, 1)
    return this
  }

  newLineBefore(...tokens: Token<Kind>[]): this {
    for (const token of tokens) {
      for (const node of this.tokens(token)) {
        linesAt(this.plan, this.range(node).first, 1)
      }
    }
    return this
  }

  newLineAfter(...tokens: Token<Kind>[]): this {
    for (const token of tokens) {
      for (const node of this.tokens(token)) {
        linesAt(this.plan, this.range(node).last + 1, 1)
      }
    }
    return this
  }

  onOwnLineProperty(...properties: Field<Kind>[]): this {
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
    return this
  }

  lineSeparated(items: readonly SyntaxNode[]): this {
    for (const node of items.slice(1)) {
      const first = this.range(node).first
      linesAt(this.plan, first, Math.max(1, this.plan.gaps[first]!.lines))
    }
    return this
  }

  block(): this {
    const open = this.node.children.find(child => child.type === '{')
    const close = this.node.children.find(child => child.type === '}')
    if (!open || !close) {
      return this
    }
    const first = this.range(open).last + 1
    const last = this.range(close).first
    if (first === last) {
      this.plan.gaps[first]!.lines = 0
      return this
    }
    linesAt(this.plan, first, 1)
    linesAt(this.plan, last, 1)
    for (let index = first; index < last; index++) {
      this.plan.gaps[index]!.indent++
    }
    const items = this.node.namedChildren.filter(node =>
      node.startIndex > open.endIndex
      && node.endIndex <= close.startIndex && node.type !== 'Comment'
    )
    return this.lineSeparated(items)
  }

  list(): this {
    const { first, last } = this.range(this.node)
    if (last > first + 1) {
      this.plan.groups.push({ first, last, preserve: this.isMultiline() || this.hasComments() })
    }
    return this
  }
}
