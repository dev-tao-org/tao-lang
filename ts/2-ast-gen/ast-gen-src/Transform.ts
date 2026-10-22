import * as CST from '@cst'
import { Timings } from '@shared'
import * as AST from './AST'

/** transform constructs an AST only for a syntactically valid source snapshot.
 *  Returned semantic nodes and numeric origins do not retain the caller-owned CST. */
export const transform = Timings.createTopLevelTimer(function(
  timings,
  tree: CST.Tree,
): AST.Document | undefined {
  if (tree.rootNode.hasError) {
    return undefined
  }
  return timings.run(transformTree, tree)
})

const transformTree = Timings.measured('transformer.transform', (tree: CST.Tree) => ({
  root: AST.Construct(tree.rootNode, 'File'),
}))
