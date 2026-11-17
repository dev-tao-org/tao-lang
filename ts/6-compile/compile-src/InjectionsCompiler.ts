import * as AST from '@ast-gen'
import { Switch, UserInput } from '@shared'
import type { ScopeCode } from './codegen-util'
import * as RuntimeEmitter from './RuntimeEmitter'
import type { PrimitiveBindings } from './ValuesCompiler'

/** compileInjection emits an authored hook declaration and its owning-view invocation. */
export function compileInjection(
  node: AST.Injection,
  bindings: PrimitiveBindings,
  names: RuntimeEmitter.ComponentNames,
  scope: ScopeCode,
): RuntimeEmitter.InjectionCompilation {
  const captures = node.captures.map(capture => compileCapture(capture, bindings, names, scope))
  return RuntimeEmitter.emitInjectionCustomHook(node, names, captures)
}

function compileCapture(
  node: AST.Capture,
  bindings: PrimitiveBindings,
  names: RuntimeEmitter.ComponentNames,
  scope: ScopeCode,
): RuntimeEmitter.InjectionCapture {
  assertCaptureName(node.name.value)
  return Switch.kind(node.value, {
    Name(name) {
      const type = bindings.get(name.value)
      const value = RuntimeEmitter.emitName(name, scope) + (type ? ` as ${type}` : '')
      return RuntimeEmitter.InjectionCapture(node, type === 'string' ? 'text' : type ?? 'unknown', value)
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
  return UserInput.Fail(`Unsupported injection context @@${reference.value}.`)
}

function assertCaptureName(name: string): void {
  if (name === 'TR' || name === 'Tao') {
    UserInput.Fail(`Injection capture name ${name} conflicts with generated JavaScript.`)
  }
}
