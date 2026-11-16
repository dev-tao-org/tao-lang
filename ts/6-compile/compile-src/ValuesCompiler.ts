import * as AST from '@ast-gen'
import { Switch } from '@shared'
import { emitLiteral, getScopeValue, type ScopeCode } from './codegen-util'
import { emitLetDeclaration, emitName } from './RuntimeEmitter'

/** compileExpression emits a literal or lexical scope lookup. */
export function compileExpression(node: AST.Expression, scope: ScopeCode): string {
  return Switch.kind(node, {
    Name: name => emitName(name, scope),
    TextLiteral: emitLiteral,
    BooleanLiteral: literal => literal.value ? 'true' : 'false',
  })
}

/** compileLetDeclaration emits one ordered immutable scope binding. */
export function compileLetDeclaration(node: AST.LetDeclaration, scope: ScopeCode): string {
  const value = compileExpression(node.value, scope)
  return emitLetDeclaration(node, getScopeValue(scope), value)
}

type TypeScriptParameterType = 'string' | 'boolean'

/** getTypeScriptParameterType maps supported Tao parameter types to their host types. */
export function getTypeScriptParameterType(parameter: AST.Parameter): TypeScriptParameterType | undefined {
  if (parameter.type.value === 'text') {
    return 'string'
  }
  if (parameter.type.value === 'boolean') {
    return 'boolean'
  }
  return undefined
}

/** hasSupportedViewParameters checks whether every view parameter has an implemented TypeScript type. */
export function hasSupportedViewParameters(declaration: AST.ViewDeclaration): boolean {
  return declaration.parameters.every(parameter => getTypeScriptParameterType(parameter) !== undefined)
}

/** isTextExpression recognizes text literals or names resolved as text in their owning scope. */
export function isTextExpression(node: AST.Expression, resolveName: (name: AST.Name) => boolean): boolean {
  return AST.IsKind(node, 'TextLiteral') || AST.IsKind(node, 'Name') && resolveName(node)
}

/** collectTextBindings identifies implemented text expressions for native capture annotations. */
export function collectTextBindings(
  definitions: readonly AST.LetDeclaration[],
  inherited: ReadonlySet<string> = new Set(),
  parameters: readonly AST.Parameter[] = [],
): ReadonlySet<string> {
  const names = new Set(inherited)
  for (const parameter of parameters) {
    updateBinding(names, parameter.name.value, parameter.type.value === 'text')
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
