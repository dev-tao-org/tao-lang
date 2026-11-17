import * as AST from '@ast-gen'
import { S } from '@shared'
import type * as Typecheck from '@typecheck'

import * as CodegenUtil from './codegen-util'

/** ComponentNames identifies stable components and collision-safe locals for one authored view. */
export type ComponentNames = {
  view: string
  useInjection: string
  props: string
  render: string
  scope: string
  scopeType: string
}

/** InjectionCapture binds one authored hook parameter to its compiled value. */
export type InjectionCapture = { node: AST.Capture; type: InjectionCaptureType; value: string }

/** TypeScriptPrimitiveType describes an implemented primitive in a generated TypeScript signature. */
export type TypeScriptPrimitiveType = 'string' | 'boolean'

/** InjectionCapture creates the typed fields for one compiled hook capture. */
export const InjectionCapture = (
  node: AST.Capture,
  type: InjectionCapture['type'],
  value: string,
): InjectionCapture => ({ node, type, value })

/** InjectionCompilation pairs authored custom-hook code with its call inside the owning view component. */
export type InjectionCompilation = { hookDeclaration: string; invocation: string }

/** emitRuntimeImports supplies the private generated boundary and the authored Tao API. */
export function emitRuntimeImports(): string {
  return S`
    import * as TR from '@runtime';
    import Tao from '@tao/runtime-api';
  `
}

/** emitModuleApplied registers the generated revision with preview instrumentation. */
export function emitModuleApplied(revision: string): string {
  return `TR.ModuleApplied(${CodegenUtil.emitStringLiteral(revision)});`
}

/** emitScope creates one module's lexical binding record. */
export function emitScope(scope: string, scopeType: string): string {
  return `const ${scope} = TR.Scope() as ${scopeType};`
}

/** emitLetDeclaration defines a compiled value under its authored name. */
export function emitLetDeclaration(node: AST.LetDeclaration, scope: string, value: string): string {
  return emitNamedDeclaration(node, scope, value)
}

/** emitModuleBinding installs a linked import without eagerly resolving module cycles. */
export function emitModuleBinding(node: Typecheck.ModuleBinding, scope: string, targetScope: string): string {
  return emitAliasBinding(node, scope, emitName(node, targetScope))
}

/** emitAppBinding makes an app's root available to linked aliases. */
export function emitAppBinding(node: AST.AppDeclaration, scope: string): string {
  return emitAliasBinding(node, scope, emitName(AST.GetAppRoot(node), scope))
}

/** emitAppDeclaration renders the selected app through its owning lexical scope. */
export function emitAppDeclaration(node: AST.AppDeclaration, scope: string, revision: string): string {
  return `TR.AppDeclaration(${emitName(AST.GetAppRoot(node), scope)}, ${CodegenUtil.emitStringLiteral(revision)})`
}

/** emitViewDeclaration registers a named component with its authored parameter contract. */
export function emitViewDeclaration(node: AST.ViewDeclaration, scope: string, component: string): string {
  const parameters = CodegenUtil.listMap(node.parameters, CodegenUtil.compileName)
  return emitNamedDeclaration(
    node,
    scope,
    `TR.ViewDeclaration(${CodegenUtil.compileName(node)}, ${parameters}, ${component}, ${scope})`,
  )
}

/** emitForeignView registers a resolved sidecar through the stable foreign component adapter. */
export function emitForeignView(node: AST.ViewDeclaration, scope: string, component: string): string {
  const parameters = CodegenUtil.listMap(node.parameters, CodegenUtil.compileName)
  return emitNamedDeclaration(
    node,
    scope,
    `TR.ForeignView(${CodegenUtil.compileName(node)}, ${parameters}, ${component}, ${scope})`,
  )
}

type EmittableName = AST.Name | Typecheck.ModuleBinding
/** emitName resolves a semantic reference or linked binding in its lexical scope. */
export function emitName(node: EmittableName, scope: CodegenUtil.ScopeCode): string {
  const name = CodegenUtil.isModuleBinding(node) ? node.target : node.value
  const reference = typeof scope === 'string' ? undefined : scope.resolveReference(name)
  return reference ?? `${CodegenUtil.getScopeValue(scope)}[${CodegenUtil.compileReferenceName(node)}]`
}

type InjectionCaptureType = TypeScriptPrimitiveType | 'children' | 'unknown'

/** emitViewRenderExpression invokes an authored view with compiled arguments and block children. */
export function emitViewRenderExpression(
  node: AST.ViewRenderExpression,
  scope: CodegenUtil.ScopeCode,
  argumentsCode: string,
  children: string,
  condition?: string,
): string {
  const interactionArguments = compileInteractionArguments(node, condition)
  const argumentsValue = `TR.ViewRenderArguments(${argumentsCode}, ${children}${interactionArguments})`
  return S`
    TR.ViewRenderExpression(
      ${emitName(node.target, scope)},
      ${argumentsValue}
    )
  `
}

/** emitViewRenderBlock evaluates child statements within their own lexical scope. */
export function emitViewRenderBlock(scope: CodegenUtil.ScopeCode, statements: string): string {
  const value = CodegenUtil.getScopeValue(scope)
  return S`
    TR.ViewRenderBlock(${value}, (${value}, _Children) => {
      ${statements}
    })
  `
}

/** emitViewComponent gives a Tao view a recognizable React component and render lifetime. */
export function emitViewComponent(
  names: ComponentNames,
  statements: string,
  result: string,
  needsScope: boolean,
): string {
  return emitRenderingComponent(names, names.view, statements, result, needsScope)
}

/** emitInjectionCustomHook keeps authored hooks visible inside their owning Tao view component. */
export function emitInjectionCustomHook(
  node: AST.Injection,
  names: ComponentNames,
  captures: readonly InjectionCapture[],
): InjectionCompilation {
  const parameters = captures.map(emitCaptureParameter).join(', ')
  const argumentsCode = captures.map(capture => capture.value).join(', ')
  return {
    hookDeclaration: S`
      function ${names.useInjection}(${parameters}) {
        ${node.code}
      }
    `,
    invocation: `${names.useInjection}(${argumentsCode})`,
  }
}

function compileInteractionArguments(node: AST.ViewRenderExpression, condition?: string): string {
  const tag = node.tag ? CodegenUtil.emitLiteral(node.tag) : undefined
  if (condition !== undefined) {
    return `, ${tag ?? 'undefined'}, TR.DisabledWhen(${condition})`
  }
  return tag === undefined ? '' : `, ${tag}`
}

function emitCaptureParameter(capture: InjectionCapture): string {
  const type = getCaptureParameterType(capture)
  return `${CodegenUtil.compileIdentifier(capture.node)}: ${type}`
}

function getCaptureParameterType(capture: InjectionCapture): string {
  return capture.type === 'children' ? "TR.ViewComponentProps['children']" : capture.type
}

function emitRenderingComponent(
  names: ComponentNames,
  component: string,
  statements: string,
  result: string,
  needsScope: boolean,
): string {
  const scope = needsScope ? `const ${names.scope} = ${names.render}.scope as ${names.scopeType};` : ''
  return S`
    export function ${component}(${names.props}: TR.ViewComponentProps) {
      const ${names.render} = TR.beginViewRender(${names.props});
      ${scope}
      ${statements}
      return TR.finishViewRender(${names.render}, ${result});
    }
  `
}

function emitNamedDeclaration(node: CodegenUtil.NamedValue, scope: string, value: string): string {
  return `TR.LetDeclaration(${scope}, ${CodegenUtil.compileName(node)}, ${value});`
}

function emitAliasBinding(node: CodegenUtil.NamedValue, scope: string, reference: string): string {
  return `TR.AliasBinding(${scope}, ${CodegenUtil.compileName(node)}, () => ${reference});`
}
