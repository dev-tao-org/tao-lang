import * as AST from '@ast-gen'
import { Errors, Switch } from '@shared'
import type * as Typecheck from '@typecheck'
import type { ScopeCode } from './codegen-util'
import * as RuntimeEmitter from './RuntimeEmitter'
import { projectPrimitiveType } from './ValuesCompiler'

/** compileInjection emits an authored hook declaration and its owning-view invocation. */
export function compileInjection(
  node: AST.Injection,
  resolveType: Typecheck.PrimitiveBindingScope,
  names: RuntimeEmitter.ComponentNames,
  scope: ScopeCode,
): RuntimeEmitter.InjectionCompilation {
  const captures = node.captures.map(capture => compileCapture(capture, resolveType, names, scope))
  return RuntimeEmitter.emitInjectionCustomHook(node, names, captures)
}

function compileCapture(
  node: AST.Capture,
  resolveType: Typecheck.PrimitiveBindingScope,
  names: RuntimeEmitter.ComponentNames,
  scope: ScopeCode,
): RuntimeEmitter.InjectionCapture {
  assertCaptureName(node.name.value)
  return Switch.kind(node.value, {
    Name(name) {
      const primitiveType = resolveType(name.value)
      const value = RuntimeEmitter.emitName(name, scope)
      if (primitiveType === undefined) {
        return RuntimeEmitter.InjectionCapture(node, 'unknown', value)
      }
      const type = projectPrimitiveType(primitiveType)
      return RuntimeEmitter.InjectionCapture(node, type, `${value} as ${type}`)
    },
    ContextReference: reference =>
      reference.value === 'children'
        ? RuntimeEmitter.InjectionCapture(node, 'children', `${names.render}.children`)
        : Errors.ThrowUserInput(`Unsupported injection context @@${reference.value}.`),
  })
}

function assertCaptureName(name: string): void {
  if (name === 'TR' || name === 'Tao') {
    Errors.ThrowUserInput(`Injection capture name ${name} conflicts with generated JavaScript.`)
  }
}
