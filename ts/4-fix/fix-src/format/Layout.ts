import type { SyntaxNode } from '@grammar/CST'
import type { LayoutHandlers } from '../lib/formatter/Formatter'

/** Layout defines Tao line boundaries, indentation and preserved list wrapping. */
export const Layout = {
  SourceFile(lm) {
    let previous: SyntaxNode | undefined
    for (const node of lm.node.namedChildren) {
      if (previous && node.type !== 'Comment' && previous.type !== 'Comment') {
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
    lm.onOwnLineProperty('visibility').block()
  },
  ViewDeclaration(lm) {
    lm.onOwnLineProperty('visibility').block()
  },
  LetDefinition(lm) {
    lm.onOwnLineProperty('visibility')
  },
  ViewRender(lm) {
    if (lm.parent?.type !== 'RenderStatement') {
      lm.onOwnLineProperty('tag')
    }
    lm.block()
  },
  TestsDeclaration(lm) {
    lm.block()
  },
  TestDeclaration(lm) {
    lm.block()
  },
  ExpectStatement(lm) {
    lm.block()
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
