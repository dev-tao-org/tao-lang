import * as CST from '@cst'
import type { SyntaxNode, Tree } from '@cst'
import type { Range } from '@shared'

/** StatementSlice owns a statement and its leading or same-line trailing comments. */
export type StatementSlice = { range: Range; node: SyntaxNode; commented: boolean }

/** collectStatementSlices attaches comments before source statements are moved or replaced. */
export function collectStatementSlices(source: string, tree: Tree): StatementSlice[] {
  const slices: StatementSlice[] = []
  let leadingCommentStart: number | undefined
  for (const node of tree.rootNode.namedChildren) {
    const previous = slices.at(-1)
    if (CST.IsComment(node)) {
      // Same-line comments move with the preceding statement; other comments lead the next one.
      if (isSameLineTrailingComment(source, previous, node)) {
        previous.range.end = node.endIndex
        previous.commented = true
      } else {
        leadingCommentStart ??= node.startIndex
      }
      continue
    }
    // This statement consumes pending leading comments and retains comments nested inside it.
    slices.push({
      range: { start: leadingCommentStart ?? node.startIndex, end: node.endIndex },
      node,
      commented: leadingCommentStart !== undefined || containsComment(node),
    })
    leadingCommentStart = undefined
  }
  return slices
}

function isSameLineTrailingComment(
  source: string,
  previous: StatementSlice | undefined,
  comment: SyntaxNode,
): previous is StatementSlice {
  return previous !== undefined && !source.slice(previous.range.end, comment.startIndex).includes('\n')
}

function containsComment(node: SyntaxNode): boolean {
  return CST.IsComment(node) || node.namedChildren.some(containsComment)
}
