import * as AST from '@ast-gen/AST'
import { Errors, Switch } from '@shared'
import { type CallbackNames, literal } from './codegen-util'

/** compileInjection emits authored TypeScript inside a view callback. */
export function compileInjection(
  node: AST.Injection,
  bindings: ReadonlySet<string>,
  callbackNames: CallbackNames,
): string {
  return [
    ...node.captures.map(capture => compileCapture(capture, bindings, callbackNames)),
    'return (() => {',
    node.code,
    '})();',
  ].join('\n')
}

function compileCapture(
  node: AST.Capture,
  bindings: ReadonlySet<string>,
  callbackNames: CallbackNames,
): string {
  assertCaptureName(node.name.value)
  const value = Switch.kind(node.value, {
    Name(name) {
      const nativeType = bindings.has(name.value) ? ' as string' : ''
      return `TR.Value(${callbackNames.values}, ${literal(name)})${nativeType}`
    },
    ContextReference: reference =>
      reference.value === 'children'
        ? callbackNames.children
        : Errors.ThrowUserInput(`Unsupported injection context @@${reference.value}.`),
  })
  return `const ${node.name.value} = ${value};`
}

function assertCaptureName(name: string): void {
  if (name === 'TR' || reservedCaptureNames.has(name)) {
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
