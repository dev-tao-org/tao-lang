import type { SyntaxNode, Tree } from '@grammar/CST'
import type { SourceRange } from '../../Source'

/** StatementSlice owns a statement and its leading or same-line trailing comments. */
export type StatementSlice = SourceRange & { node: SyntaxNode; commented: boolean }

/** statementSlices attaches comments before source statements are moved or replaced. */
export function statementSlices(source: string, tree: Tree): StatementSlice[] {
  const slices: StatementSlice[] = []
  let leading: number | undefined
  for (const node of tree.rootNode.namedChildren) {
    const previous = slices.at(-1)
    if (node.type === 'Comment') {
      if (previous && !source.slice(previous.end, node.startIndex).includes('\n')) {
        previous.end = node.endIndex
        previous.commented = true
      } else {
        leading ??= node.startIndex
      }
      continue
    }
    slices.push({
      start: leading ?? node.startIndex,
      end: node.endIndex,
      node,
      commented: leading !== undefined || containsComment(node),
    })
    leading = undefined
  }
  return slices
}

function containsComment(node: SyntaxNode): boolean {
  return node.type === 'Comment' || node.namedChildren.some(containsComment)
}
