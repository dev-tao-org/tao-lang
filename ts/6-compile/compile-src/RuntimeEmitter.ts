import * as AST from '@ast-gen/AST'
import { S } from '@shared'
import type { ModuleBinding } from '@typecheck/Modules'
import {
  compileIdentifier,
  compileName,
  compileReferenceName,
  emitLiteral,
  emitStringLiteral,
  listMap,
  type NamedValue,
} from './codegen-util'

/** ComponentNames identifies stable components and collision-safe locals for one authored view. */
export type ComponentNames = {
  view: string
  useInjection: string
  props: string
  render: string
  scope: string
}

/** InjectionCapture binds one authored hook parameter to its compiled value. */
export type InjectionCapture = { node: AST.Capture; type: 'text' | 'children' | 'unknown'; value: string }

/** InjectionCompilation pairs authored custom-hook code with its call inside the owning view component. */
export type InjectionCompilation = { hookDeclaration: string; invocation: string }

/** emitRuntimeImports supplies the private generated boundary and the authored Tao API. */
export function emitRuntimeImports(): string {
  return "import * as TR from '@runtime';\nimport Tao from '@tao/runtime-api';"
}

/** emitModuleApplied registers the generated revision with preview instrumentation. */
export function emitModuleApplied(revision: string): string {
  return `TR.ModuleApplied(${emitStringLiteral(revision)});`
}

/** emitScope creates one module's lexical binding record. */
export function emitScope(scope: string): string {
  return `const ${scope} = TR.Scope();`
}

/** emitLetDeclaration defines a compiled value under its authored name. */
export function emitLetDeclaration(node: AST.LetDeclaration, scope: string, value: string): string {
  return emitNamedDeclaration(node, scope, value)
}

/** emitModuleBinding installs a linked import without eagerly resolving module cycles. */
export function emitModuleBinding(node: ModuleBinding, scope: string, targetScope: string): string {
  return emitAliasBinding(node, scope, emitName(node, targetScope))
}

/** emitAppBinding makes an app's root available to linked aliases. */
export function emitAppBinding(node: AST.AppDeclaration, scope: string): string {
  return emitAliasBinding(node, scope, emitName(AST.GetAppRoot(node), scope))
}

/** emitAppDeclaration renders the selected app through its owning lexical scope. */
export function emitAppDeclaration(node: AST.AppDeclaration, scope: string, revision: string): string {
  return `TR.AppDeclaration(${emitName(AST.GetAppRoot(node), scope)}, ${emitStringLiteral(revision)})`
}

/** emitViewDeclaration registers a named component with its authored parameter contract. */
export function emitViewDeclaration(node: AST.ViewDeclaration, scope: string, component: string): string {
  const parameters = listMap(node.parameters, compileName)
  return emitNamedDeclaration(
    node,
    scope,
    `TR.ViewDeclaration(${compileName(node)}, ${parameters}, ${component}, ${scope})`,
  )
}

/** emitForeignView registers a resolved sidecar through the stable foreign component adapter. */
export function emitForeignView(node: AST.ViewDeclaration, scope: string, component: string): string {
  const parameters = listMap(node.parameters, compileName)
  return emitNamedDeclaration(
    node,
    scope,
    `TR.ForeignView(${compileName(node)}, ${parameters}, ${component}, ${scope})`,
  )
}

/** emitName resolves a semantic reference or linked binding in its lexical scope. */
export function emitName(node: AST.Name | ModuleBinding, scope: string): string {
  return `TR.Name(${scope}, ${compileReferenceName(node)})`
}

/** emitViewRenderExpression invokes an authored view with compiled arguments and block children. */
export function emitViewRenderExpression(
  node: AST.ViewRenderExpression,
  scope: string,
  argumentsCode: string,
  children: string,
): string {
  const tag = node.tag ? `, ${emitLiteral(node.tag)}` : ''
  const argumentsValue = `TR.ViewRenderArguments(${argumentsCode}, ${children}${tag})`
  return `TR.ViewRenderExpression(${emitName(node.target, scope)}, ${argumentsValue})`
}

/** emitViewRenderBlock evaluates child statements within their own lexical scope. */
export function emitViewRenderBlock(scope: string, statements: string): string {
  return `TR.ViewRenderBlock(${scope}, (${scope}, _Children) => {\n${statements}\n})`
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

function emitCaptureParameter(capture: InjectionCapture): string {
  const type = capture.type === 'children'
    ? "TR.ViewComponentProps['children']"
    : capture.type === 'text'
    ? 'string'
    : 'unknown'
  return `${compileIdentifier(capture.node)}: ${type}`
}

function emitRenderingComponent(
  names: ComponentNames,
  component: string,
  statements: string,
  result: string,
  needsScope: boolean,
): string {
  const scope = needsScope ? `const ${names.scope} = ${names.render}.scope;` : ''
  return S`
    function ${component}(${names.props}: TR.ViewComponentProps) {
      const ${names.render} = TR.beginViewRender(${names.props});
      ${scope}
      ${statements}
      return TR.finishViewRender(${names.render}, ${result});
    }
  `
}

function emitNamedDeclaration(node: NamedValue, scope: string, value: string): string {
  return `TR.LetDeclaration(${scope}, ${compileName(node)}, ${value});`
}

function emitAliasBinding(node: NamedValue, scope: string, reference: string): string {
  return `TR.AliasBinding(${scope}, ${compileName(node)}, () => ${reference});`
}
