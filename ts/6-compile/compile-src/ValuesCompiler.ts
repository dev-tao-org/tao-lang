import * as AST from '@ast-gen'
import { Switch } from '@shared'
import * as Typecheck from '@typecheck'
import { emitLiteral, getScopeValue, listMap, type ScopeCode } from './codegen-util'
import * as RuntimeEmitter from './RuntimeEmitter'

/** compileExpression emits the authored scalar operation or lexical lookup. */
export function compileExpression(node: AST.Expression, scope: ScopeCode, boundOperand?: string): string {
  const scalar = (expression: AST.ScalarApplication) =>
    RuntimeEmitter.emitScalarExpression(expression, scope, compileExpression(expression.value, scope, boundOperand))
  return Switch.kind(node, {
    Name: name => boundOperand ?? RuntimeEmitter.emitName(name, scope),
    TextLiteral: emitLiteral,
    NumberLiteral: literal => Object.is(literal.value, -0) ? '-0' : String(literal.value),
    GroupedExpression: group => compileExpression(group.value, scope, boundOperand),
    ConstructionExpression: scalar,
    ConversionExpression: scalar,
  })
}

/** compileLetDeclaration emits one ordered immutable scope binding. */
export function compileLetDeclaration(node: AST.LetDeclaration, scope: ScopeCode): string {
  const scopeName = getScopeValue(scope)
  const operand = AST.GetExpressionOperand(node.value)
  if (typeof scope !== 'string' && scope.liveLocalAliases && AST.IsKind(operand, 'Name')) {
    const adapted = compileExpression(node.value, scope, '_Value')
    return RuntimeEmitter.emitLocalAlias(node, scopeName, operand, adapted === '_Value' ? undefined : adapted)
  }
  return RuntimeEmitter.emitLetDeclaration(node, scopeName, compileExpression(node.value, scope))
}

/** compileViewValueDeclaration emits one immutable name or retained state slot. */
export function compileViewValueDeclaration(node: AST.ViewValueDeclaration, scope: ScopeCode): string {
  return Switch.kind(node, {
    LetDeclaration: definition => compileLetDeclaration(definition, scope),
    StateDeclaration: definition =>
      RuntimeEmitter.emitStateDeclaration(definition, getScopeValue(scope), compileExpression(definition.value, scope)),
  })
}

type Invocation = AST.ViewRenderExpression | AST.DoStatement
/** compileArguments emits the positional values of a view or action invocation. */
export function compileArguments(node: Invocation, scope: ScopeCode): string {
  return listMap(node.arguments, argument => compileExpression(argument, scope))
}

/** PrimitiveType is a scalar kept in its unwrapped representation in generated TypeScript. */
export type PrimitiveType = 'string' | 'number'

/** PrimitiveBindings projects known primitive values in the generated lexical scope. */
export type PrimitiveBindings = ReadonlyMap<string, PrimitiveType>

type ResolvePrimitiveName = (name: AST.Name) => PrimitiveType | undefined

/** projectPrimitiveType maps a checked Tao type name, including aliases, to TypeScript. */
export function projectPrimitiveType(name: AST.Name, types: Typecheck.ScalarTypeScope): PrimitiveType | undefined {
  const resolved = types.resolve(name)
  if (resolved === Typecheck.TextType) {
    return 'string'
  }
  return resolved === Typecheck.NumberType ? 'number' : undefined
}

/** projectExpressionType identifies primitive literals, names and widening results for TypeScript captures. */
export function projectExpressionType(
  node: AST.Expression,
  types: Typecheck.ScalarTypeScope,
  resolveName: ResolvePrimitiveName,
): PrimitiveType | undefined {
  return Switch.kind(node, {
    TextLiteral: () => 'string',
    Name: resolveName,
    ConversionExpression: value => projectPrimitiveType(value.type, types),
    GroupedExpression: value => projectExpressionType(value.value, types, resolveName),
    NumberLiteral: () => 'number',
    ConstructionExpression: () => undefined,
  })
}

/** collectPrimitiveBindings identifies scalar expressions for native capture annotations. */
export function collectPrimitiveBindings(
  definitions: readonly AST.ViewValueDeclaration[],
  inherited: PrimitiveBindings,
  parameters: readonly AST.Parameter[],
  types: Typecheck.ScalarTypeScope,
): PrimitiveBindings {
  const names = new Map(inherited)
  for (const parameter of parameters) {
    updateBinding(names, parameter.name.value, projectPrimitiveType(parameter.type, types))
  }
  for (const definition of definitions) {
    const type = projectExpressionType(definition.value, types, name => names.get(name.value))
    updateBinding(names, definition.name.value, type)
  }
  return names
}

type MutablePrimitiveBindings = Map<string, PrimitiveType>

function updateBinding(names: MutablePrimitiveBindings, name: string, type?: PrimitiveType): void {
  if (type) {
    names.set(name, type)
  } else {
    names.delete(name)
  }
}
