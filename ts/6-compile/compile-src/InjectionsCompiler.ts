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
