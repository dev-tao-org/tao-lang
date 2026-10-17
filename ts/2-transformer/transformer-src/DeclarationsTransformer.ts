import type Parser from 'tree-sitter'
import type * as AST from './AST'
import type { ASTConstructor } from './ASTConstructor'
import { requiredChild } from './transform-util'

/** DeclarationsTransformer constructs declarations without resolving their references. */
export const DeclarationsTransformer = {
  AppDeclaration(this: ASTConstructor, node: Parser.SyntaxNode): AST.AppDeclaration {
    return {
      kind: 'AppDeclaration',
      name: this.Node(node, 'name'),
      root: this.Node(requiredChild(node, 'root_declaration'), 'view'),
    }
  },
}
