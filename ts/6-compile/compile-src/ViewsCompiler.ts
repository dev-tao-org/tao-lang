import * as AST from '@ast-gen/AST'
import { S, Switch } from '@shared'
import { type CallbackNames, listMap, literal, unusedName } from './codegen-util'
import { compileInjection } from './InjectionsCompiler'
import { compileExpression, compileLetDefinition, textBindings } from './ValuesCompiler'

/** compileViewDeclaration emits one registered view definition. */
export function compileViewDeclaration(node: AST.ViewDeclaration, inherited: ReadonlySet<string>): string {
  const parameters = listMap(node.parameters, parameter => literal(parameter.name))
  const callbackNames = callbackNamesFor(node)
  return S`
    _views[${literal(node.name)}] = TR.ViewDefinition(${
    literal(node.name)
  }, ${parameters}, (${callbackNames.values}, ${callbackNames.children}) => {
      ${node.definitions.map(definition => compileLetDefinition(definition, callbackNames.values)).join('\n')}
      ${compileNode(node.render, textBindings(node.definitions, inherited, node.parameters), callbackNames)}
    }, _scope);
  `
}

function compileNode(
  node: AST.ViewRender | AST.Injection,
  bindings: ReadonlySet<string>,
  callbackNames: CallbackNames,
): string {
  return Switch.kind(node, {
    ViewRender: value => `return ${compileViewRender(value, callbackNames)};`,
    Injection: value => compileInjection(value, bindings, callbackNames),
  })
}

function compileViewRender(node: AST.ViewRender, callbackNames: CallbackNames): string {
  return `TR.Render(_views[${literal(node.target)}], TR.ViewRenderArgs(${
    listMap(
      node.arguments,
      argument => compileExpression(argument, callbackNames.values),
    )
  }, ${compileChildren(node.children, callbackNames)}${node.tag ? ', ' + literal(node.tag) : ''}))`
}

function compileChildren(children: AST.ViewRender['children'], callbackNames: CallbackNames): string {
  if (children.every(AST.IsViewRender)) {
    return listMap(children, child => compileViewRender(child, callbackNames))
  }
  const names = { ...callbackNames, values: '_taoBlock' }
  const statements = children.map(child =>
    AST.IsLetDefinition(child)
      ? compileLetDefinition(child, names.values)
      : `_taoNodes.push(${compileViewRender(child, names)});`
  ).join('\n')
  return `TR.RenderChildren(${callbackNames.values}, (${names.values}, _taoNodes) => {\n${statements}\n})`
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
