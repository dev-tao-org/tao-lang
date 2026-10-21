import { Timings } from '@shared'
import type Parser from 'tree-sitter'
import * as AST from './AST'

/** transform constructs an AST only for a syntactically valid source snapshot.
 *  Returned semantic nodes and numeric origins do not retain the caller-owned CST. */
export const transform = Timings.topLevelTimer(function(
  timings,
  tree: Parser.Tree,
): AST.Document | undefined {
  if (tree.rootNode.hasError) {
    return undefined
  }
  return timings.run(transformTree, tree)
})

const transformTree = Timings.measured('transformer.transform', (tree: Parser.Tree) => ({
  root: AST.Construct(tree.rootNode, 'File'),
}))
