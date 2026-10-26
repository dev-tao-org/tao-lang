import type * as AST from '@ast-gen/AST'
import type { ModuleBinding } from '@typecheck/Modules'

/** NamedValue identifies a named AST declaration, parameter, capture or linked module binding. */
export type NamedValue = Pick<AST.ValueDeclaration | AST.Parameter | AST.Capture, 'name'> | Pick<ModuleBinding, 'name'>

/** emitStringLiteral escapes an external string for a generated JavaScript literal. */
export function emitStringLiteral(value: string): string {
  return JSON.stringify(value)
}

/** emitLiteral serializes a source string as a JavaScript string literal. */
export function emitLiteral(node: AST.Name | AST.TextLiteral | AST.RenderTag): string {
  return emitStringLiteral(node.value)
}

/** compileName quotes the declared name of an AST node or linked module binding. */
export function compileName(node: NamedValue): string {
  return emitStringLiteral(typeof node.name === 'string' ? node.name : node.name.value)
}

/** compileReferenceName quotes the referenced name or linked binding's target. */
export function compileReferenceName(node: AST.Name | ModuleBinding): string {
  return 'target' in node ? emitStringLiteral(node.target) : emitLiteral(node)
}

/** compileIdentifier emits an already validated source identifier without string quoting. */
export function compileIdentifier(node: Pick<AST.ViewDeclaration | AST.Capture, 'name'>): string {
  return node.name.value
}

/** listMap emits an array literal compiled from its input values. */
export function listMap<T>(values: readonly T[], compile: (value: T) => string): string {
  return `[${values.map(compile).join(', ')}]`
}
