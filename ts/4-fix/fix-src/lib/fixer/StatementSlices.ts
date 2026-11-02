import * as CST from '@cst'
import type { SyntaxNode, Tree } from '@cst'
import * as Shared from '@shared'

/** StatementSlice owns a statement and its leading or same-line trailing comments. */
export type StatementSlice = { range: Shared.Range; node: SyntaxNode; commented: boolean }

/** collectStatementSlices attaches comments before source statements are moved or replaced. */
export function collectStatementSlices(source: string, tree: Tree): StatementSlice[] {
  const slices: StatementSlice[] = []
  let leadingCommentStart: LeadingCommentStart
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
      range: Shared.Range(leadingCommentStart ?? node.startIndex, node.endIndex),
      node,
      commented: leadingCommentStart !== undefined || containsComment(node),
    })
    leadingCommentStart = undefined
  }
  return slices
}

type PreviousStatementSlice = StatementSlice | undefined
function isSameLineTrailingComment(
  source: string,
  previous: PreviousStatementSlice,
  comment: SyntaxNode,
): previous is StatementSlice {
  return previous !== undefined
    && !Shared.Source.slice(source, previous.range.end, comment.startIndex).includes(Shared.NewlineCharacter)
}

type LeadingCommentStart = number | undefined

function containsComment(node: SyntaxNode): boolean {
  return CST.IsComment(node) || node.namedChildren.some(containsComment)
}
