import * as AST from '@ast-gen/AST'
import { Errors, Switch } from '@shared'
import ts from 'typescript'
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

function createReservedCaptureNames(): ReadonlySet<string> {
  // Await is reserved in modules; eval and arguments are forbidden strict-mode bindings.
  const names = new Set(['await', 'eval', 'arguments'])
  for (let kind = ts.SyntaxKind.FirstReservedWord; kind <= ts.SyntaxKind.LastFutureReservedWord; kind++) {
    const keyword = ts.tokenToString(kind)
    if (keyword) {
      names.add(keyword)
    }
  }
  return names
}

const reservedCaptureNames = createReservedCaptureNames()
