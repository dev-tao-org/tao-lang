import type Parser from 'tree-sitter'
import type * as AST from './AST'
import type { ASTConstructor } from './ASTConstructor'

/** FileTransformer constructs semantic files using the shared AST constructor. */
export const FileTransformer = {
  File(this: ASTConstructor, node: Parser.SyntaxNode): AST.File {
    return { kind: 'File', declarations: this.List(node) }
  },
}
