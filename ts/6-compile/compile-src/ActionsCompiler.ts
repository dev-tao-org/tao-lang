import * as AST from '@ast-gen'
import { Errors, NewlineCharacter, Switch } from '@shared'
import { getScopeValue, type ScopeCode } from './codegen-util'
import * as RuntimeEmitter from './RuntimeEmitter'
import { compileArguments, compileExpression } from './ValuesCompiler'
import { shadowReferences } from './ViewReferences'

/** compileActionDeclaration emits a deferred action body with child-scope parameters. */
export function compileActionDeclaration(node: AST.ActionDeclaration, scope: ScopeCode): string {
  const actionScope = shadowReferences(scope, node.parameters)
  const body = compileActionBody(node.block, actionScope)
  return RuntimeEmitter.emitActionDeclaration(node, getScopeValue(scope), body)
}

/** compilePressBinding emits a named action reference or an anonymous action body. */
export function compilePressBinding(node: AST.PressBinding, scope: ScopeCode): string {
  const handler: string = Switch.kind(node.handler, {
    Name: name => RuntimeEmitter.emitName(name, scope),
    InlineAction: action =>
      RuntimeEmitter.emitInlineAction(getScopeValue(scope), compileActionBody(action.body, scope)),
  })
  return RuntimeEmitter.emitPressBinding(handler)
}

function compileActionBody(body: AST.InlineActionBody, scope: ScopeCode): string {
  const statements = AST.IsKind(body, 'Block') ? body.statements : [body]
  return statements.map(statement => compileActionStatement(statement, scope)).join(NewlineCharacter)
}

function compileActionStatement(node: AST.Statement, scope: ScopeCode): string {
  if (AST.IsKind(node, 'SetStatement')) {
    return RuntimeEmitter.emitSetStatement(node, scope, compileExpression(node.value, scope))
  }
  if (AST.IsKind(node, 'DoStatement')) {
    return RuntimeEmitter.emitDoStatement(node, scope, compileArguments(node, scope))
  }
  return Errors.ThrowShouldNeverHappen(`Unexpected ${node.kind} in a validated action block.`)
}
