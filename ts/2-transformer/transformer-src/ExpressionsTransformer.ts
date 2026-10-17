import type Parser from 'tree-sitter'
import type * as AST from './AST'

/** ExpressionsTransformer constructs expression leaves without retaining CST references. */
export const ExpressionsTransformer = {
  Name(node: Parser.SyntaxNode): AST.Name {
    return { kind: 'Name', value: node.text }
  },
}
