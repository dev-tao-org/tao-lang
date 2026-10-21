import type * as AST from '@ast-gen/AST'
import type { ModuleBinding } from '@typecheck/Modules'
import { compileName, compileReferenceName, literal, type NamedValue } from './codegen-util'

/** compileBinding registers a computed value under its declared scope name. */
export function compileBinding(node: NamedValue, scope: string, value: string): string {
  return `TR.LetDefinition(${scope}, ${compileName(node)}, ${value});`
}

/** compileLazyBinding registers a reference evaluated only when the binding is read. */
export function compileLazyBinding(node: NamedValue, scope: string, reference: string): string {
  return `TR.LetReference(${scope}, ${compileName(node)}, () => ${reference});`
}

/** compileValueReference reads an authored name or linked import from its owning scope. */
export function compileValueReference(node: AST.Name | ModuleBinding, scope: string): string {
  return `TR.Value(${scope}, ${compileReferenceName(node)})`
}

/** compileViewReference reads a view by its authored name from the current scope. */
export function compileViewReference(node: AST.Name, scope: string): string {
  return `TR.ViewReference(${scope}, ${literal(node)})`
}
