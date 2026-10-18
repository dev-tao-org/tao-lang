import { Errors } from '@shared'
import { cloneElement, createContext, createElement, isValidElement, Suspense, useContext, useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { previewOptions } from './Preview'

/** View is a named runtime definition whose renderer receives bound values and children. */
export type View = {
  readonly name: string
  readonly parameters: readonly string[]
  readonly render: ViewRenderer
  readonly [viewMarker]: true
}

/** ViewRenderArgs holds positional values and child nodes for one view call. */
export type ViewRenderArgs = {
  readonly values: readonly unknown[]
  readonly children: readonly ReactNode[]
}

/** ViewRenderer renders a view from its named values and ordered children. */
export type ViewRenderer = (
  bindings: Readonly<Record<string, unknown>>,
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
export function ViewDefinition(name: string, parameters: readonly string[], render: ViewRenderer): View {
  return { name, parameters: [...parameters], render, [viewMarker]: true }
}

/** ViewRenderArgs packages positional values and optional children for a view call. */
export function ViewRenderArgs(values: readonly unknown[] = [], children: readonly ReactNode[] = []): ViewRenderArgs {
  return {
    values,
    children: children.map((child, index) =>
      isValidElement(child) ? cloneElement(child, { key: child.key ?? index }) : child
    ),
  }
}

/** Render is the public root-level alias for creating a runtime view element. */
export function Render(view: View, args: ViewRenderArgs, observer?: RuntimeObserver): ReactElement {
  const body = createElement(ViewBody, { view, args })
  return observer ? createElement(RuntimeObserverContext.Provider, { value: observer }, body) : body
}

/** App renders a zero-argument root and acknowledges its revision after commit. */
export function App(view: View, revision: string, options: AppOptions = previewOptions()): ReactElement {
  return createElement(AppRoot, { view, revision, options })
}

const viewMarker: unique symbol = Symbol('TaoView')

type ViewBodyProps = {
  view: View
  args: ViewRenderArgs
}

type AppRootProps = {
  view: View
  revision: string
  options: AppOptions
}

function ViewBody({ view, args }: ViewBodyProps): ReactNode {
  const observer = useContext(RuntimeObserverContext)
  const bindingStartedAt = observer?.now()
  const bindings = bindValues(view, args)
  observe(observer, 'bind', bindingStartedAt)
  const startedAt = observer?.now()
  const result = view.render(bindings, args.children)
  observe(observer, 'render', startedAt)
  return result
}

function AppRoot({ view, revision, options }: AppRootProps): ReactNode {
  const observer = options.observer
  const startedAt = observer?.now()
  const subtree = Render(view, ViewRenderArgs())
  return createElement(
    RuntimeObserverContext.Provider,
    { value: observer },
    createElement(
      Suspense,
      { fallback: options.fallback ?? null },
      createElement(CommitAfterRender, { children: subtree, revision, options, observer, startedAt }),
    ),
  )
}

type CommitAfterRenderProps = {
  children: ReactNode
  revision: string
  options: AppOptions
  observer?: RuntimeObserver
  startedAt?: number
}

function CommitAfterRender({ children, revision, options, observer, startedAt }: CommitAfterRenderProps): ReactNode {
  const onApplied = options.onApplied
  useEffect(() => {
    observe(observer, 'render-to-applied', startedAt)
    onApplied?.(revision)
  }, [observer, onApplied, revision])
  return children
}

function bindValues(view: View, args: ViewRenderArgs): Readonly<Record<string, unknown>> {
  if (!isView(view)) {
    Errors.ThrowUserInput('Cannot render an unknown Tao view.')
  }
  const missingIndex = view.parameters.findIndex((_parameter, index) => index >= args.values.length)
  if (missingIndex >= 0) {
    Errors.ThrowUserInput(`${view.name} is missing required argument "${view.parameters[missingIndex]}"`)
  }
  const bindings: Record<string, unknown> = {}
  for (const [index, parameter] of view.parameters.entries()) {
    bindings[parameter] = args.values[index]
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
