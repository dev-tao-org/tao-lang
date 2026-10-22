import * as AST from '@ast-gen/AST'
import { Errors, S, Switch } from '@shared'
import { compileBinding, compileViewReference } from './BindingsCompiler'
import { allocateUnusedName, type CallbackNames, compileName, emitLiteral, listMap } from './codegen-util'
import { compileInjection } from './InjectionsCompiler'
import { collectTextBindings, compileExpression, compileLetDefinition, isTextParameter } from './ValuesCompiler'

/** compileViewDeclaration registers a view in its owning module scope. */
export function compileViewDeclaration(
  node: AST.ViewDeclaration,
  inherited: ReadonlySet<string>,
  scope: string,
  foreignComponent?: string,
): string {
  const parameters = listMap(node.parameters, compileName)
  if (AST.IsKind(node.render, 'ForeignView')) {
    if (!node.parameters.every(isTextParameter)) {
      Errors.ThrowUserInput(`Foreign view ${node.name.value} parameters must all use the text type.`)
    }
    const component = foreignComponent
      ?? Errors.ThrowShouldNeverHappen(`Missing compiled import for foreign view ${node.name.value}.`)
    const definition = `TR.ForeignView(${compileName(node)}, ${parameters}, ${component}, ${scope})`
    return compileBinding(node, scope, definition)
  }
  const callbackNames = callbackNamesFor(node)
  const definitions = node.definitions
    .map(definition => compileLetDefinition(definition, callbackNames.values))
    .join('\n')
  const render = compileNode(
    node.render,
    collectTextBindings(node.definitions, inherited, node.parameters),
    callbackNames,
  )
  const definition = S`
    TR.ViewDefinition(${compileName(node)}, ${parameters}, (${callbackNames.values}, ${callbackNames.children}) => {
      ${definitions}
      ${render}
    }, ${scope})
  `
  return compileBinding(node, scope, definition)
}

function compileNode(
  node: AST.ViewRender | AST.Injection,
  bindings: ReadonlySet<string>,
  callbackNames: CallbackNames,
): string {
  return Switch.kind(node, {
    ViewRender: value => `return ${compileViewRender(value, callbackNames, callbackNames.values)};`,
    Injection: value => compileInjection(value, bindings, callbackNames),
  })
}

function compileViewRender(
  node: AST.ViewRender,
  callbackNames: CallbackNames,
  scope: string,
): string {
  return `TR.Render(${compileViewReference(node.target, scope)}, TR.ViewRenderArgs(${
    listMap(
      node.arguments,
      argument => compileExpression(argument, callbackNames.values),
    )
  }, ${compileChildren(node.children, callbackNames, scope)}${node.tag ? ', ' + emitLiteral(node.tag) : ''}))`
}

function compileChildren(
  children: AST.ViewRender['children'],
  callbackNames: CallbackNames,
  scope: string,
): string {
  if (children.every(AST.IsViewRender)) {
    return listMap(children, child => compileViewRender(child, callbackNames, scope))
  }
  const names = { ...callbackNames, values: '_taoBlock' }
  const statements = children.map(child =>
    AST.IsLetDefinition(child)
      ? compileLetDefinition(child, names.values)
      : `_taoNodes.push(${compileViewRender(child, names, names.values)});`
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
    values: allocateUnusedName('_taoValues', occupied),
    children: allocateUnusedName('_taoChildren', occupied),
  }
}
