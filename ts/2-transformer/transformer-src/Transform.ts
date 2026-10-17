import { Errors, Timings } from '@shared'
import { Platform } from '@shared/os'
import type Parser from 'tree-sitter'
import type * as AST from './AST'

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

// ASTConstructor owns one source snapshot and records origins at its Node dispatch boundary.
class ASTConstructor {
  readonly origins = new Map<AST.Node, AST.Origin>()

  File(node: Parser.SyntaxNode): AST.File {
    return { kind: 'File', declarations: this.List(node) }
  }

  AppDeclaration(node: Parser.SyntaxNode): AST.AppDeclaration {
    return {
      kind: 'AppDeclaration',
      name: this.Node(node, 'name'),
      root: this.Node(requiredChild(node, 'root_declaration'), 'view'),
    }
  }

  Name(node: Parser.SyntaxNode): AST.Name {
    return { kind: 'Name', value: node.text }
  }

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

function requiredField(node: Parser.SyntaxNode, field: string): Parser.SyntaxNode {
  return node.childForFieldName(field)
    ?? Errors.ThrowUnexpected(`Missing CST field ${field} on ${node.type}.`)
}

function requiredChild(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode {
  return node.namedChildren.find(child => child.type === type)
    ?? Errors.ThrowUnexpected(`Missing CST child ${type} on ${node.type}.`)
}
