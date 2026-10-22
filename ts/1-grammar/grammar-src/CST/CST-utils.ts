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

/** TypeScriptBody extracts a TypeScript CST node's fenced source, preserving its interior whitespace. */
export function TypeScriptBody(cst: Pick<SyntaxNode, 'text'>): string {
  // ex: "```ts\nX\n```" -> "\nX\n"
  return cst.text.slice(5, -3)
}
