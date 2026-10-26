import * as CST from '@cst'
import type { SyntaxNode } from '@cst'
import type { LayoutHandlers } from '../lib/formatter/Formatter'

/** Layout defines Tao line boundaries, indentation and preserved list wrapping. */
export const Layout = {
  SourceFile(lm) {
    let previous: SyntaxNode | undefined
    for (const node of lm.node.namedChildren) {
      if (previous && !CST.IsComment(node) && !CST.IsComment(previous)) {
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
  UseStatement(lm) {
    lm.commaList('from')
  },
  Injection(lm) {
    lm.commaList('code')
  },
} satisfies LayoutHandlers

function isImport(node: SyntaxNode): boolean {
  return node.type === 'UseStatement' || node.type === 'UsePackageStatement'
    || node.type === 'RequiresDeclaration'
}
