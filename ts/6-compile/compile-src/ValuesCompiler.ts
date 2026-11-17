import * as AST from '@ast-gen'
import { Switch } from '@shared'
import { emitLiteral, emitStringLiteral, getScopeValue, listMap, type ScopeCode } from './codegen-util'
import * as RuntimeEmitter from './RuntimeEmitter'

/** compileExpression emits a literal, lexical lookup or runtime expression. */
export function compileExpression(node: AST.Expression, scope: ScopeCode): string {
  return Switch.kind(node, {
    Name: name => RuntimeEmitter.emitName(name, scope),
    TextLiteral: emitLiteral,
    InterpolatedText: text => RuntimeEmitter.emitInterpolatedText(compileTextParts(text, scope)),
  })
}

/** compileLetDeclaration emits one ordered immutable scope binding. */
export function compileLetDeclaration(node: AST.LetDeclaration, scope: ScopeCode): string {
  const scopeName = getScopeValue(scope)
  if (typeof scope !== 'string' && scope.liveLocalAliases && AST.IsKind(node.value, 'Name')) {
    return RuntimeEmitter.emitLocalAlias(node, scopeName, node.value)
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

/** isTextParameter identifies a parameter declared with Tao's text type. */
export function isTextParameter(node: AST.Parameter): boolean {
  return node.type.value === 'text'
}

/** isTextExpression recognizes text expressions and names resolved as text in their owning scope. */
export function isTextExpression(node: AST.Expression, resolveName: (name: AST.Name) => boolean): boolean {
  return AST.IsKind(node, 'Name') ? resolveName(node) : true
}

/** collectTextBindings identifies implemented text expressions for native capture annotations. */
export function collectTextBindings(
  definitions: readonly AST.ViewValueDeclaration[],
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

function compileTextParts(node: AST.InterpolatedText, scope: ScopeCode): string {
  return listMap(node.parts, part =>
    Switch.kind(part, {
      TextSegment: segment => emitStringLiteral(segment.value),
      TextInterpolation: interpolation => compileExpression(interpolation.value, scope),
    }))
}

function updateBinding(names: Set<string>, name: string, isText: boolean): void {
  if (isText) {
    names.add(name)
  } else {
    names.delete(name)
  }
}
