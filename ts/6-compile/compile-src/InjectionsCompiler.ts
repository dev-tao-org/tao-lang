import * as AST from '@ast-gen/AST'
import { Errors, Switch } from '@shared'
import { type CallbackNames, literal } from './codegen-util'

/** compileInjection emits authored TypeScript inside a view callback. */
export function compileInjection(
  node: AST.Injection,
  parameters: readonly AST.Parameter[],
  callbackNames: CallbackNames,
): string {
  return [
    ...node.captures.map(capture => compileCapture(capture, parameters, callbackNames)),
    'return (() => {',
    node.code,
    '})();',
  ].join('\n')
}

function compileCapture(
  node: AST.Capture,
  parameters: readonly AST.Parameter[],
  callbackNames: CallbackNames,
): string {
  const value = Switch.kind(node.value, {
    Name(name) {
      const parameter = parameters.find(parameter => parameter.name.value === name.value)
      const nativeType = parameter?.type.value === 'text' ? ' as string' : ''
      return `${callbackNames.values}[${literal(name)}]${nativeType}`
    },
    ContextReference: reference =>
      reference.value === 'children'
        ? callbackNames.children
        : Errors.ThrowUserInput(`Unsupported injection context @@${reference.value}.`),
  })
  return `const ${node.name.value} = ${value};`
}
