import { Errors } from '@shared'
import type Parser from 'tree-sitter'
import type * as AST from './AST'
import { DeclarationsTransformer } from './DeclarationsTransformer'
import { ExpressionsTransformer } from './ExpressionsTransformer'
import { FileTransformer } from './FileTransformer'
import { requiredField } from './transform-util'

/** ASTConstructor constructs one source snapshot, recording origins at its Node dispatch boundary.
 *  Each transformation owns a fresh instance; no CST node or global construction state is retained. */
export class ASTConstructor {
  readonly origins = new Map<AST.Node, AST.Origin>()

  File = FileTransformer.File
  AppDeclaration = DeclarationsTransformer.AppDeclaration
  Name = ExpressionsTransformer.Name

  Node(node: Parser.SyntaxNode, field: 'name' | 'view'): AST.Name
  Node(node: Parser.SyntaxNode): AST.Node
  Node(node: Parser.SyntaxNode, field?: 'name' | 'view'): AST.Node {
    const source = field ? requiredField(node, field) : node
    const result = this.construct(source)
    if (field && result.kind !== 'Name') {
      Errors.ThrowUnexpected(`Expected a name in CST field ${field} on ${node.type}.`)
    }
    this.origins.set(result, { start: source.startIndex, end: source.endIndex })
    return result
  }

  List(node: Parser.SyntaxNode): AST.AppDeclaration[] {
    return node.namedChildren.map(child => {
      const result = this.Node(child)
      if (result.kind !== 'AppDeclaration') {
        Errors.ThrowUnexpected(`Expected a declaration in ${node.type}.`)
      }
      return result
    })
  }

  private construct(node: Parser.SyntaxNode): AST.Node {
    switch (node.type) {
      case 'source_file':
        return this.File(node)
      case 'app_declaration':
        return this.AppDeclaration(node)
      case 'identifier':
        return this.Name(node)
      default:
        return Errors.ThrowUnexpected(`CST transformation is not implemented for ${node.type}.`)
    }
  }
}
