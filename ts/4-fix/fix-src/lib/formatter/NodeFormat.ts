import * as CST from '@cst'

import { NewlineCharacter } from '@shared'
import { createNodeKey, type LayoutPlan, spaceAt } from '../layout/Plan'

type SelectedPropertyNode = CST.SyntaxNode | null

/** NodeContext supplies source-anchored selections shared by both handler tables. */
export class NodeContext<Kind extends CST.NodeType> {
  constructor(
    readonly node: CST.SyntaxNode,
    protected readonly plan: LayoutPlan,
    readonly parent?: CST.SyntaxNode,
  ) {}

  isMultiline(): boolean {
    return this.node.text.includes(NewlineCharacter)
  }

  hasComments(): boolean {
    const range = this.range(this.node)
    return this.plan.tokens.slice(range.first, range.last + 1).some(node => CST.IsComment(node))
  }

  protected property(name: CST.Field<Kind>): SelectedPropertyNode {
    return this.node.childForFieldName(name)
  }

  protected tokens(token: CST.Token<Kind>): readonly CST.SyntaxNode[] {
    return this.node.children.filter(child => child.type === token)
  }

  protected range(node: CST.SyntaxNode): { first: number; last: number } {
    return this.plan.bounds.get(createNodeKey(node))!
  }
}

type SpaceSide = 'before' | 'after'

/** NodeFormat declares horizontal spacing and opaque source regions through independent commands. */
export class NodeFormat<Kind extends CST.NodeType> extends NodeContext<Kind> {
  oneSpaceBefore(...tokens: CST.Token<Kind>[]): void {
    this.spaces(tokens, 'before', 1)
  }

  oneSpaceAfter(...tokens: CST.Token<Kind>[]): void {
    this.spaces(tokens, 'after', 1)
  }

  oneSpaceAround(...tokens: CST.Token<Kind>[]): void {
    this.oneSpaceBefore(...tokens)
    this.oneSpaceAfter(...tokens)
  }

  noSpaceBefore(...tokens: CST.Token<Kind>[]): void {
    this.spaces(tokens, 'before', 0)
  }

  noSpaceAfter(...tokens: CST.Token<Kind>[]): void {
    this.spaces(tokens, 'after', 0)
  }

  noSpaceAround(...tokens: CST.Token<Kind>[]): void {
    this.noSpaceBefore(...tokens)
    this.noSpaceAfter(...tokens)
  }

  oneSpaceBeforeProperty(...properties: CST.Field<Kind>[]): void {
    this.propertySpaces(properties, 1)
  }

  noSpaceBeforeProperty(...properties: CST.Field<Kind>[]): void {
    this.propertySpaces(properties, 0)
  }

  noSpaceAroundProperty(property: CST.Field<Kind>): void {
    for (const node of this.node.childrenForFieldName(property)) {
      const range = this.range(node)
      spaceAt(this.plan, range.first, 0)
      spaceAt(this.plan, range.last + 1, 0)
    }
  }

  private propertySpaces(properties: readonly CST.Field<Kind>[], count: number): void {
    for (const name of properties) {
      const node = this.property(name)
      if (node) {
        spaceAt(this.plan, this.range(node).first, count)
      }
    }
  }

  preserveProperty(...properties: CST.Field<Kind>[]): void {
    for (const name of properties) {
      const node = this.property(name)
      if (node) {
        const { first, last } = this.range(node)
        for (let index = first + 1; index <= last; index++) {
          this.plan.gaps[index]!.editable = false
        }
      }
    }
  }

  commaSpacedList(): void {
    for (const node of this.node.children) {
      const { first, last } = this.range(node)
      if (node.type === ',' || node.type === ')') {
        spaceAt(this.plan, first, 0)
      }
      if (node.type === '(' || node.type === ',') {
        spaceAt(this.plan, last + 1, node.type === ',' ? 1 : 0)
      }
    }
  }

  private spaces(tokens: readonly CST.Token<Kind>[], side: SpaceSide, count: number): void {
    for (const token of tokens) {
      for (const node of this.tokens(token)) {
        const range = this.range(node)
        spaceAt(this.plan, side === 'before' ? range.first : range.last + 1, count)
      }
    }
  }
}
