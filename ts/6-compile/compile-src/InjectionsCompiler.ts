import * as AST from '@ast-gen'
import { Errors, Switch } from '@shared'
import type { ScopeCode } from './codegen-util'
import * as RuntimeEmitter from './RuntimeEmitter'
import { isTextExpression } from './ValuesCompiler'

/** compileInjection emits an authored hook declaration and its owning-view invocation. */
export function compileInjection(
  node: AST.Injection,
  bindings: ReadonlySet<string>,
  names: RuntimeEmitter.ComponentNames,
  scope: ScopeCode,
): RuntimeEmitter.InjectionCompilation {
  const captures = node.captures.map(capture => compileCapture(capture, bindings, names, scope))
  return RuntimeEmitter.emitInjectionCustomHook(node, names, captures)
}

function compileCapture(
  node: AST.Capture,
  bindings: ReadonlySet<string>,
  names: RuntimeEmitter.ComponentNames,
  scope: ScopeCode,
): RuntimeEmitter.InjectionCapture {
  assertCaptureName(node.name.value)
  return Switch.kind(node.value, {
    Name(name) {
      const text = isTextExpression(name, reference => bindings.has(reference.value))
      const value = RuntimeEmitter.emitName(name, scope) + (text ? ' as string' : '')
      return RuntimeEmitter.InjectionCapture(node, text ? 'text' : 'unknown', value)
    },
    ContextReference: reference => compileContextCapture(node, reference, names),
  })
}

function compileContextCapture(
  node: AST.Capture,
  reference: AST.ContextReference,
  names: RuntimeEmitter.ComponentNames,
): RuntimeEmitter.InjectionCapture {
  if (reference.value === 'children' || reference.value === 'press') {
    return RuntimeEmitter.InjectionCapture(node, reference.value, `${names.render}.${reference.value}`)
  }
  return Errors.ThrowUserInput(`Unsupported injection context @@${reference.value}.`)
}

function assertCaptureName(name: string): void {
  if (name === 'TR' || name === 'Tao') {
    Errors.ThrowUserInput(`Injection capture name ${name} conflicts with generated JavaScript.`)
  }
}
