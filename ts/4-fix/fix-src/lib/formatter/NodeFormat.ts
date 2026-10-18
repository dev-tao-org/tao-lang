import type { Field, NodeType, SyntaxNode, Token } from '@grammar/CST'
import { type LayoutPlan, nodeKey, spaceAt } from '../layout/Plan'

/** NodeContext supplies source-anchored selections shared by both handler tables. */
export class NodeContext<Kind extends NodeType> {
  constructor(
    readonly node: SyntaxNode,
    protected readonly plan: LayoutPlan,
    readonly parent?: SyntaxNode,
  ) {}

  isMultiline(): boolean {
    return this.node.text.includes('\n')
  }

  hasComments(): boolean {
    const range = this.range(this.node)
    return this.plan.tokens.slice(range.first, range.last + 1).some(node => node.type === 'Comment')
  }

  protected property(name: Field<Kind>): SyntaxNode | null {
    return this.node.childForFieldName(name)
  }

  protected tokens(token: Token<Kind>): readonly SyntaxNode[] {
    return this.node.children.filter(child => child.type === token)
  }

  protected range(node: SyntaxNode): { first: number; last: number } {
    return this.plan.bounds.get(nodeKey(node))!
  }
}

/** NodeFormat declares horizontal spacing and opaque source regions for one typed CST rule. */
export class NodeFormat<Kind extends NodeType> extends NodeContext<Kind> {
  oneSpaceBefore(...tokens: Token<Kind>[]): this {
    return this.spaces(tokens, 'before', 1)
  }

  oneSpaceAfter(...tokens: Token<Kind>[]): this {
    return this.spaces(tokens, 'after', 1)
  }

  oneSpaceAround(...tokens: Token<Kind>[]): this {
    return this.oneSpaceBefore(...tokens).oneSpaceAfter(...tokens)
  }

  noSpaceBefore(...tokens: Token<Kind>[]): this {
    return this.spaces(tokens, 'before', 0)
  }

  noSpaceAfter(...tokens: Token<Kind>[]): this {
    return this.spaces(tokens, 'after', 0)
  }

  noSpaceAround(...tokens: Token<Kind>[]): this {
    return this.noSpaceBefore(...tokens).noSpaceAfter(...tokens)
  }

  oneSpaceBeforeProperty(...properties: Field<Kind>[]): this {
    return this.propertySpaces(properties, 1)
  }

  noSpaceBeforeProperty(...properties: Field<Kind>[]): this {
    return this.propertySpaces(properties, 0)
  }

  private propertySpaces(properties: readonly Field<Kind>[], count: number): this {
    for (const name of properties) {
      const node = this.property(name)
      if (node) {
        spaceAt(this.plan, this.range(node).first, count)
      }
    }
    return this
  }

  preserveProperty(...properties: Field<Kind>[]): this {
    for (const name of properties) {
      const node = this.property(name)
      if (node) {
        const { first, last } = this.range(node)
        for (let index = first + 1; index <= last; index++) {
          this.plan.gaps[index]!.editable = false
        }
      }
    }
    return this
  }

  commaSpacedList(): this {
    for (const node of this.node.children) {
      const { first, last } = this.range(node)
      if (node.type === ',' || node.type === ')') {
        spaceAt(this.plan, first, 0)
      }
      if (node.type === '(' || node.type === ',') {
        spaceAt(this.plan, last + 1, node.type === ',' ? 1 : 0)
      }
    }
    return this
  }

  private spaces(tokens: readonly Token<Kind>[], side: 'before' | 'after', count: number): this {
    for (const token of tokens) {
      for (const node of this.tokens(token)) {
        const range = this.range(node)
        spaceAt(this.plan, side === 'before' ? range.first : range.last + 1, count)
      }
    }
    return this
  }
}
