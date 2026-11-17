import * as CST from '@cst'

import type { LayoutHandlers } from '../lib/formatter/Formatter'

/** Layout defines Tao line boundaries, indentation and preserved list wrapping. */
export const Layout = {
  PublishDeclaration(lm) {
    lm.block()
  },
  SourceFile(lm) {
    let previous: PreviousSyntaxNode
    for (const node of lm.node.namedChildren) {
      // Leave boundaries touching comments alone so their declaration attachment is preserved.
      if (isDeclarationBoundary(previous, node)) {
        // Keep adjacent imports together; separate other top-level declarations with a blank line.
        if (isImport(node) && isImport(previous)) {
          lm.lineBefore(node)
        } else {
          lm.blankLineBefore(node)
        }
      }
      previous = node
    }
  },
  AppDeclaration(lm) {
    lm.onOwnLineProperty('visibility')
  },
  ViewDeclaration(lm) {
    lm.onOwnLineProperty('visibility')
  },
  LetDeclaration(lm) {
    lm.onOwnLineProperty('visibility')
  },
  FunctionDeclaration(lm) {
    lm.onOwnLineProperty('visibility')
  },
  Block(lm) {
    lm.block()
  },
  ViewRenderExpression(lm) {
    if (lm.parent?.type !== 'RenderViewExpressionStatement') {
      lm.onOwnLineProperty('tag')
    }
  },
  ParameterList(lm) {
    lm.list()
  },
  ArgumentList(lm) {
    lm.list()
  },
  FunctionArgumentList(lm) {
    lm.list()
  },
  UseStatement(lm) {
    lm.commaList()
  },
  Injection(lm) {
    lm.commaList('code')
  },
} satisfies LayoutHandlers

function isDeclarationBoundary(previous: PreviousSyntaxNode, node: CST.SyntaxNode): previous is CST.SyntaxNode {
  return previous !== undefined && !CST.IsComment(node) && !CST.IsComment(previous)
}

type PreviousSyntaxNode = CST.SyntaxNode | undefined

function isImport(node: CST.SyntaxNode): boolean {
  return node.type === 'UseStatement'
    || node.type === 'RequiresDeclaration'
}
