import * as AST from '@ast-gen'
import { Switch } from '@shared'
import { emitLiteral, getScopeValue, type ScopeCode } from './codegen-util'
import { emitLetDeclaration, emitName } from './RuntimeEmitter'

/** compileExpression emits a literal or lexical scope lookup. */
export function compileExpression(node: AST.Expression, scope: ScopeCode): string {
  return Switch.kind(node, {
    Name: name => emitName(name, scope),
    TextLiteral: emitLiteral,
  })
}

/** compileLetDeclaration emits one ordered immutable scope binding. */
export function compileLetDeclaration(node: AST.LetDeclaration, scope: ScopeCode): string {
  const value = compileExpression(node.value, scope)
  return emitLetDeclaration(node, getScopeValue(scope), value)
}

/** isTextParameter identifies a parameter declared with Tao's text type. */
export function isTextParameter(node: AST.Parameter): boolean {
  return node.type.value === 'text'
}

/** isTextExpression recognizes text literals or names resolved as text in their owning scope. */
export function isTextExpression(node: AST.Expression, resolveName: (name: AST.Name) => boolean): boolean {
  return AST.IsKind(node, 'TextLiteral') || resolveName(node)
}

/** collectTextBindings identifies implemented text expressions for native capture annotations. */
export function collectTextBindings(
  definitions: readonly AST.LetDeclaration[],
  inherited: ReadonlySet<string> = new Set(),
  parameters: readonly AST.Parameter[] = [],
): ReadonlySet<string> {
  const names = new Set(inherited)
  for (const parameter of parameters) {
    updateBinding(names, parameter.name.value, isTextParameter(parameter))
  }
  for (const definition of definitions) {
    const isText = isTextExpression(definition.value, name => names.has(name.value))
    updateBinding(names, definition.name.value, isText)
  }
  return names
}

function updateBinding(names: Set<string>, name: string, isText: boolean): void {
  if (isText) {
    names.add(name)
  } else {
    names.delete(name)
  }
}
