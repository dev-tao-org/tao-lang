import { Errors } from '@shared'
import type { SyntaxNode } from '../CST'

/** IsSemanticNode excludes grammar extras from semantic construction. */
export function IsSemanticNode(node: Pick<SyntaxNode, 'isExtra'>): boolean {
  return !node.isExtra
}

/** IsComment identifies comment syntax specifically, independently of other grammar extras. */
export function IsComment(node: Pick<SyntaxNode, 'type'>): boolean {
  return node.type === 'Comment'
}

/** RequiredField returns a required CST field. */
export function RequiredField(cst: SyntaxNode, field: string): SyntaxNode {
  return cst.childForFieldName(field) ?? Errors.ThrowShouldNeverHappen(`Missing CST field ${field} on ${cst.type}.`)
}

/** RequiredChild returns a required named CST child of the requested type. */
export function RequiredChild(cst: SyntaxNode, type: string): SyntaxNode {
  return cst.namedChildren.find(child => child.type === type)
    ?? Errors.ThrowShouldNeverHappen(`Missing CST child ${type} on ${cst.type}.`)
}
