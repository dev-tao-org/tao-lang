import * as AST from '@ast-gen/AST'
import { S, Switch } from '@shared'
import { type CallbackNames, listMap, literal, unusedName } from './codegen-util'
import { compileInjection } from './InjectionsCompiler'

/** compileViewDeclaration emits one registered view definition. */
export function compileViewDeclaration(node: AST.ViewDeclaration): string {
  const parameters = listMap(node.parameters, parameter => literal(parameter.name))
  const callbackNames = callbackNamesFor(node)
  return S`
    _views[${literal(node.name)}] = TR.ViewDefinition(${
    literal(node.name)
  }, ${parameters}, (${callbackNames.values}, ${callbackNames.children}) => {
      ${compileNode(node.render, node.parameters, callbackNames)}
    });
  `
}

function compileNode(
  node: AST.ViewRender | AST.Injection,
  parameters: readonly AST.Parameter[],
  callbackNames: CallbackNames,
): string {
  return Switch.kind(node, {
    ViewRender: value => `return ${compileViewRender(value, callbackNames)};`,
    Injection: value => compileInjection(value, parameters, callbackNames),
  })
}

function compileViewRender(node: AST.ViewRender, callbackNames: CallbackNames): string {
  return `TR.Render(_views[${literal(node.target)}], TR.ViewRenderArgs(${
    listMap(
      node.arguments,
      argument => compileExpression(argument, callbackNames),
    )
  }, ${listMap(node.children, child => compileViewRender(child, callbackNames))}))`
}

function compileExpression(node: AST.Expression, callbackNames: CallbackNames): string {
  return Switch.kind(node, {
    Name: name => `${callbackNames.values}[${literal(name)}]`,
    TextLiteral: text => literal(text),
  })
}

function callbackNamesFor(node: AST.ViewDeclaration): CallbackNames {
  const occupied = new Set<string>(node.parameters.map(parameter => parameter.name.value))
  const injection = AST.IsInjection(node.render) ? node.render : undefined
  for (const capture of injection?.captures ?? []) {
    occupied.add(capture.name.value)
  }
  return {
    values: unusedName('_taoValues', occupied),
    children: unusedName('_taoChildren', occupied),
  }
}
