import * as AST from '@ast-gen'
import { Errors, Switch } from '@shared'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
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

/** usesTaoRuntime finds an authored Tao API identifier, excluding comments and string literals. */
export function usesTaoRuntime(code: string): boolean {
  if (!code.includes('Tao')) {
    return false
  }
  const source = TypeScript.createSourceFile('injection.tsx', code, TypeScript.ScriptTarget.Latest, true)
  return containsTaoIdentifier(source) === true
}

function containsTaoIdentifier(node: TypeScript.Node): true | undefined {
  if (TypeScript.isIdentifier(node) && node.text === 'Tao') {
    return true
  }
  return TypeScript.forEachChild(node, containsTaoIdentifier)
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
