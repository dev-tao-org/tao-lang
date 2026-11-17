import * as AST from '@ast-gen'
import { Switch } from '@shared'
import * as Typecheck from '@typecheck'
import { emitLiteral, getScopeValue, type ScopeCode } from './codegen-util'
import { emitLetDeclaration, emitName, type TypeScriptPrimitiveType } from './RuntimeEmitter'

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

/** getTypeScriptParameterType maps supported Tao parameter types to their host types. */
export function getTypeScriptParameterType(parameter: AST.Parameter): TypeScriptPrimitiveType | undefined {
  const type = Typecheck.resolvePrimitiveParameterType(parameter)
  return type === undefined ? undefined : projectPrimitiveType(type)
}

/** projectPrimitiveType maps an implemented Tao primitive to its TypeScript type. */
export function projectPrimitiveType(type: Typecheck.PrimitiveType): TypeScriptPrimitiveType {
  return type === 'text' ? 'string' : type
}

/** hasSupportedViewParameters checks whether every view parameter has an implemented TypeScript type. */
export function hasSupportedViewParameters(declaration: AST.ViewDeclaration): boolean {
  return declaration.parameters.every(parameter => getTypeScriptParameterType(parameter) !== undefined)
}

/** createViewPrimitiveScope resolves parameters, private views and lets in their lexical order. */
export function createViewPrimitiveScope(
  parent: Typecheck.PrimitiveBindingScope,
  definitions: readonly AST.LetDeclaration[],
  parameters: readonly AST.Parameter[],
  views: readonly AST.ViewDeclaration[],
): Typecheck.PrimitiveBindingScope {
  const bindings: Typecheck.PrimitiveTypesByName = new Map()
  const scope = Typecheck.createLocalPrimitiveScope(bindings, parent)
  for (const parameter of parameters) {
    bindings.set(parameter.name.value, Typecheck.resolvePrimitiveParameterType(parameter))
  }
  for (const view of views) {
    bindings.set(view.name.value, undefined)
  }
  for (const definition of definitions) {
    const type = Typecheck.resolvePrimitiveExpressionType(definition.value, scope)
    bindings.set(definition.name.value, type)
  }
  return scope
}
