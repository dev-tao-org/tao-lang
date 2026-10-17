import { Errors } from '@shared'
import type Parser from 'tree-sitter'

/** requiredField reads a CST field guaranteed by the implemented grammar. */
export function requiredField(node: Parser.SyntaxNode, field: string): Parser.SyntaxNode {
  return node.childForFieldName(field)
    ?? Errors.ThrowUnexpected(`Missing CST field ${field} on ${node.type}.`)
}

/** requiredChild reads a named CST child when the grammar has no field for its wrapper. */
export function requiredChild(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode {
  return node.namedChildren.find(child => child.type === type)
    ?? Errors.ThrowUnexpected(`Missing CST child ${type} on ${node.type}.`)
}
