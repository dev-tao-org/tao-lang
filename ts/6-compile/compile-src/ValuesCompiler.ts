import * as AST from '@ast-gen'
import { Switch } from '@shared'
import { emitLiteral, getScopeValue, listMap, type ScopeCode } from './codegen-util'
import * as RuntimeEmitter from './RuntimeEmitter'

/** compileExpression emits the authored scalar operation or lexical lookup. */
export function compileExpression(node: AST.Expression, scope: ScopeCode): string {
  const scalar = (expression: AST.ScalarApplication) =>
    RuntimeEmitter.emitScalarExpression(expression, scope, compileExpression(expression.value, scope))
  return Switch.kind(node, {
    Name: name => RuntimeEmitter.emitName(name, scope),
    TextLiteral: emitLiteral,
    NumberLiteral: literal => Object.is(literal.value, -0) ? '-0' : String(literal.value),
    GroupedExpression: group => compileExpression(group.value, scope),
    ConstructionExpression: scalar,
    ConversionExpression: scalar,
  })
}

/** compileLetDeclaration emits one ordered immutable scope binding. */
export function compileLetDeclaration(node: AST.LetDeclaration, scope: ScopeCode): string {
  const scopeName = getScopeValue(scope)
  const operand = AST.GetExpressionOperand(node.value)
  if (typeof scope !== 'string' && scope.liveLocalAliases && AST.IsKind(operand, 'Name')) {
    return RuntimeEmitter.emitLocalAlias(
      node,
      scopeName,
      operand,
      parameter => compileExpression(node.value, bindLocalAliasOperand(scope, operand, parameter)),
    )
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

/** projectPrimitiveType maps a Tao primitive type name to TypeScript. */
export function projectPrimitiveType(name: AST.Name): PrimitiveType | undefined {
  if (name.value === 'text') {
    return 'string'
  }
  return name.value === 'number' ? 'number' : undefined
}

/** projectExpressionType identifies primitive literals, names and widening results for TypeScript captures. */
export function projectExpressionType(
  node: AST.Expression,
  resolveName: ResolvePrimitiveName,
): PrimitiveType | undefined {
  return Switch.kind(node, {
    TextLiteral: () => 'string',
    Name: resolveName,
    ConversionExpression: value => projectPrimitiveType(value.type),
    GroupedExpression: value => projectExpressionType(value.value, resolveName),
    NumberLiteral: () => 'number',
    ConstructionExpression: () => undefined,
  })
}

/** collectPrimitiveBindings identifies scalar expressions for native capture annotations. */
export function collectPrimitiveBindings(
  definitions: readonly AST.ViewValueDeclaration[],
  inherited: PrimitiveBindings,
  parameters: readonly AST.Parameter[],
): PrimitiveBindings {
  const names = new Map(inherited)
  for (const parameter of parameters) {
    updateBinding(names, parameter.name.value, projectPrimitiveType(parameter.type))
  }
  for (const definition of definitions) {
    const type = projectExpressionType(definition.value, name => names.get(name.value))
    updateBinding(names, definition.name.value, type)
  }
  return names
}

type MutablePrimitiveBindings = Map<string, PrimitiveType>

type ResolvedScopeCode = Exclude<ScopeCode, string>

function bindLocalAliasOperand(scope: ResolvedScopeCode, operand: AST.Name, parameter: string): ResolvedScopeCode {
  return {
    ...scope,
    resolveReference: name => name === operand.value ? parameter : scope.resolveReference(name),
  }
}

function updateBinding(names: MutablePrimitiveBindings, name: string, type?: PrimitiveType): void {
  if (type) {
    names.set(name, type)
  } else {
    names.delete(name)
  }
}
