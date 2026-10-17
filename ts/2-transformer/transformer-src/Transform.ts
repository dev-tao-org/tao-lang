import { Errors, Timings } from '@shared'
import { Platform } from '@shared/os'
import type Parser from 'tree-sitter'
import type * as AST from './AST'
import { ASTConstructor } from './ASTConstructor'

/** transform constructs an AST only for a syntactically valid source snapshot.
 *  Syntax errors produce no document; valid but unimplemented node kinds fail explicitly.
 *  Returned semantic nodes and numeric origins do not retain the caller-owned CST. */
export function transform(
  tree: Parser.Tree,
  timings = new Timings(`process:${Platform.pid}`),
): AST.Document | undefined {
  if (tree.rootNode.hasError) {
    return undefined
  }
  return timings.measure('transformer.transform', () => {
    const AST = new ASTConstructor()
    const root = AST.Node(tree.rootNode)
    if (root.kind !== 'File') {
      Errors.ThrowUnexpected('Expected a source file at the CST root.')
    }
    return { root, origins: AST.origins }
  })
}
