import * as AST from '@ast-gen/AST'
import { Errors, Switch } from '@shared'
import type { ScopeCode } from './codegen-util'
import {
  type ComponentNames,
  emitInjectionCustomHook,
  emitName,
  type InjectionCapture,
  type InjectionCompilation,
} from './RuntimeEmitter'
import { isTextExpression } from './ValuesCompiler'

/** compileInjection emits an authored hook declaration and its owning-view invocation. */
export function compileInjection(
  node: AST.Injection,
  bindings: ReadonlySet<string>,
  names: ComponentNames,
  scope: ScopeCode,
): InjectionCompilation {
  const captures = node.captures.map(capture => compileCapture(capture, bindings, names, scope))
  return emitInjectionCustomHook(node, names, captures)
}

function compileCapture(
  node: AST.Capture,
  bindings: ReadonlySet<string>,
  names: ComponentNames,
  scope: ScopeCode,
): InjectionCapture {
  assertCaptureName(node.name.value)
  return Switch.kind(node.value, {
    Name(name) {
      const text = isTextExpression(name, reference => bindings.has(reference.value))
      const value = emitName(name, scope) + (text ? ' as string' : '')
      return { node, type: text ? 'text' : 'unknown', value }
    },
    ContextReference: reference =>
      reference.value === 'children'
        ? { node, type: 'children', value: `${names.render}.children` }
        : Errors.ThrowUserInput(`Unsupported injection context @@${reference.value}.`),
  })
}

function assertCaptureName(name: string): void {
  if (name === 'TR' || name === 'Tao' || reservedCaptureNames.has(name)) {
    Errors.ThrowUserInput(`Injection capture name ${name} conflicts with generated JavaScript.`)
  }
}

const reservedCaptureNames = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])
