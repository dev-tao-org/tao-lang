import type * as AST from '@ast-gen/AST'
import type { ModuleBinding } from '@typecheck/Modules'

/** CallbackNames contains collision-safe generated callback parameter names. */
export type CallbackNames = { values: string; children: string }

/** NamedValue identifies a named AST declaration, parameter, capture or linked module binding. */
export type NamedValue = Pick<AST.ValueDeclaration | AST.Parameter | AST.Capture, 'name'> | Pick<ModuleBinding, 'name'>

/** stringLiteral escapes an external string for a generated JavaScript literal. */
export function stringLiteral(value: string): string {
  return JSON.stringify(value)
}

/** literal serializes a source string as a JavaScript string literal. */
export function literal(node: AST.Name | AST.TextLiteral | AST.RenderTag): string {
  return stringLiteral(node.value)
}

/** compileName quotes the declared name of an AST node or linked module binding. */
export function compileName(node: NamedValue): string {
  return stringLiteral(typeof node.name === 'string' ? node.name : node.name.value)
}

/** compileReferenceName quotes the referenced name or linked binding's target. */
export function compileReferenceName(node: AST.Name | ModuleBinding): string {
  return 'target' in node ? stringLiteral(node.target) : literal(node)
}

/** compileIdentifier emits an already validated source identifier without string quoting. */
export function compileIdentifier(node: Pick<AST.ViewDeclaration | AST.Capture, 'name'>): string {
  return node.name.value
}

/** listMap emits an array literal compiled from its input values. */
export function listMap<T>(values: readonly T[], compile: (value: T) => string): string {
  return `[${values.map(compile).join(', ')}]`
}

/** unusedName reserves and returns a generated name absent from the occupied set. */
export function unusedName(base: string, occupied: Set<string>): string {
  let candidate = base
  let suffix = 0
  while (occupied.has(candidate)) {
    candidate = `${base}${++suffix}`
  }
  occupied.add(candidate)
  return candidate
}
