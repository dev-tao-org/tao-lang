import { Errors } from '@shared'
import { cloneElement, createContext, createElement, isValidElement, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { LetDefinition, Scope } from './Scope'
import type { Scope as RuntimeScope } from './Scope'

/** View is a named runtime definition whose renderer receives bound values and children. */
export type View = {
  readonly name: string
  readonly parameters: readonly string[]
  readonly render: ViewRenderer
  readonly scope: RuntimeScope
  readonly [viewMarker]: true
}

/** ViewRenderArgs holds positional values and child nodes for one view call. */
export type ViewRenderArgs = {
  readonly values: readonly unknown[]
  readonly children: readonly ReactNode[]
  readonly tag?: string
}

/** ViewRenderer renders a view from its named values and ordered children. */
export type ViewRenderer = (
  bindings: RuntimeScope,
  children: readonly ReactNode[],
) => ReactNode

/** RuntimeTiming describes one measured runtime phase. */
export type RuntimeTiming = {
  phase: 'bind' | 'render' | 'render-to-applied'
  durationMs: number
}

/** RuntimeObserver injects a clock and receives runtime phase timings. */
export type RuntimeObserver = {
  now(): number
  onTiming(timing: RuntimeTiming): void
}

/** AppOptions configures the preview acknowledgement and runtime timings. */
export type AppOptions = {
  onApplied?(revision: string): void
  observer?: RuntimeObserver
  fallback?: ReactNode
}

/** ViewDefinition creates a generic runtime view without assigning built-in Tao view names. */
export function ViewDefinition(
  name: string,
  parameters: readonly string[],
  render: ViewRenderer,
  scope: RuntimeScope = Scope(),
): View {
  return { name, parameters: [...parameters], render, scope, [viewMarker]: true }
}

/** ViewReference resolves a view from its owning lexical scope. */
export function ViewReference(scope: RuntimeScope, name: string): View {
  const view = scope[name]
  if (!isView(view)) {
    Errors.ThrowUserInput(`Unknown Tao view: ${name}.`)
  }
  return view
}

/** ViewRenderArgs packages positional values and optional children for a view call. */
export function ViewRenderArgs(
  values: readonly unknown[] = [],
  children: readonly ReactNode[] = [],
  tag?: string,
): ViewRenderArgs {
  return {
    values,
    tag,
    children: children.map((child, index) =>
      isValidElement(child) ? cloneElement(child, { key: child.key ?? index }) : child
    ),
  }
}

/** Render is the public root-level alias for creating a runtime view element. */
export function Render(view: View, args: ViewRenderArgs, observer?: RuntimeObserver): ReactElement {
  const body = createElement(ViewBody, { view, args })
  return observer ? ProvideRuntimeObserver(observer, body) : body
}

/** ProvideRuntimeObserver sets the timing observer for a runtime subtree. */
export function ProvideRuntimeObserver(observer: RuntimeObserver | undefined, children: ReactNode): ReactElement {
  return createElement(RuntimeObserverContext.Provider, { value: observer }, children)
}

const viewMarker: unique symbol = Symbol('TaoView')

type ViewBodyProps = {
  view: View
  args: ViewRenderArgs
  testID?: string
}

function ViewBody({ view, args, testID }: ViewBodyProps): ReactNode {
  const observer = useContext(RuntimeObserverContext)
  const bindingStartedAt = observer?.now()
  const bindings = bindValues(view, args)
  observe(observer, 'bind', bindingStartedAt)
  const startedAt = observer?.now()
  const result = view.render(bindings, args.children)
  observe(observer, 'render', startedAt)
  return applyTestID(result, args.tag ?? testID)
}

function applyTestID(result: ReactNode, testID: string | undefined): ReactNode {
  if (testID === undefined || !isValidElement(result)) {
    return result
  }
  return cloneElement(result as ReactElement<{ testID?: string }>, { testID })
}

function bindValues(view: View, args: ViewRenderArgs): RuntimeScope {
  if (!isView(view)) {
    Errors.ThrowUserInput('Cannot render an unknown Tao view.')
  }
  const missingIndex = view.parameters.findIndex((_parameter, index) => index >= args.values.length)
  if (missingIndex >= 0) {
    Errors.ThrowUserInput(`${view.name} is missing required argument "${view.parameters[missingIndex]}"`)
  }
  const bindings = Scope(view.scope)
  for (const [index, parameter] of view.parameters.entries()) {
    LetDefinition(bindings, parameter, args.values[index])
  }
  return bindings
}

function isView(value: unknown): value is View {
  return typeof value === 'object' && value !== null && viewMarker in value
}

function observe(
  observer: RuntimeObserver | undefined,
  phase: RuntimeTiming['phase'],
  startedAt: number | undefined,
): void {
  if (!observer || startedAt === undefined) {
    return
  }
  observer.onTiming({ phase, durationMs: observer.now() - startedAt })
}

const RuntimeObserverContext = createContext<RuntimeObserver | undefined>(undefined)
