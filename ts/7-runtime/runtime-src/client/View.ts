import { Errors } from '@shared'
import { cloneElement, createContext, createElement, isValidElement, useContext } from 'react'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import { LetDeclaration, Scope } from './Scope'
import type { Scope as RuntimeScope } from './Scope'

/** View identifies a named component, its positional parameters and captured lexical scope. */
export type View = {
  readonly name: string
  readonly parameters: readonly string[]
  readonly render: ComponentType<ViewComponentProps>
  readonly scope: RuntimeScope
  readonly foreignComponent?: ComponentType<never>
  readonly [viewMarker]: true
}

/** ViewComponentProps carries one bound Tao view into its named React component. */
export type ViewComponentProps = {
  readonly view: View
  readonly scope: RuntimeScope
  readonly children: readonly ReactNode[]
  readonly testID?: string
  readonly observer?: RuntimeObserver
}

/** ViewRenderContext keeps bound values and timing around one component render. */
export type ViewRenderContext = ViewComponentProps & { readonly startedAt?: number }

/** ViewRenderArguments holds positional values, ordered children and an optional native tag. */
export type ViewRenderArguments = {
  readonly values: readonly unknown[]
  readonly children: readonly ReactNode[]
  readonly testID?: string
}

/** AppOptions configures the preview acknowledgement and runtime timings. */
export type AppOptions = {
  onApplied?(revision: string): void
  observer?: RuntimeObserver
  fallback?: ReactNode
}

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

/** ViewDeclaration creates a named component-backed runtime view. */
export function ViewDeclaration(
  name: string,
  parameters: readonly string[],
  render: ComponentType<ViewComponentProps>,
  scope: RuntimeScope = Scope(),
): View {
  return { name, parameters: [...parameters], render, scope, [viewMarker]: true }
}

/** ViewRenderArguments packages positional values, children and an optional test identifier. */
export function ViewRenderArguments(
  values: readonly unknown[] = [],
  inputChildren: readonly ReactNode[] = [],
  testID?: string,
): ViewRenderArguments {
  const children = inputChildren.map((child, index) =>
    isValidElement(child) ? cloneElement(child, { key: child.key ?? index }) : child
  )
  return { values, testID, children }
}

/** ViewRenderExpression creates an element for a named view resolved from a Tao scope. */
export function ViewRenderExpression(
  candidate: unknown,
  args: ViewRenderArguments,
  observer?: RuntimeObserver,
): ReactElement {
  const body = createElement(ViewBody, { candidate, args, key: args.testID })
  return observer ? ProvideRuntimeObserver(observer, body) : body
}

/** beginViewRender starts timing and exposes the already bound component inputs. */
export function beginViewRender(props: ViewComponentProps): ViewRenderContext {
  const startedAt = props.observer?.now()
  return { ...props, scope: Scope(props.scope), startedAt }
}

/** finishViewRender reports this component's time and tags its returned native root. */
export function finishViewRender(context: ViewRenderContext, result: ReactNode): ReactNode {
  observe(context.observer, 'render', context.startedAt)
  return applyTestID(result, context.testID)
}

/** ProvideRuntimeObserver sets the timing observer for a runtime subtree. */
export function ProvideRuntimeObserver(observer: RuntimeObserver | undefined, children: ReactNode): ReactElement {
  return createElement(RuntimeObserverContext.Provider, { value: observer }, children)
}

const viewMarker: unique symbol = Symbol('TaoView')
const RuntimeObserverContext = createContext<RuntimeObserver | undefined>(undefined)

type ViewBodyProps = { candidate: unknown; args: ViewRenderArguments; testID?: string }

function ViewBody({ candidate, args, testID }: ViewBodyProps): ReactElement {
  const view = requireView(candidate)
  const observer = useContext(RuntimeObserverContext)
  const bindingStartedAt = observer?.now()
  const scope = bindValues(view, args)
  observe(observer, 'bind', bindingStartedAt)
  const componentProps = { view, scope, children: args.children, testID: args.testID ?? testID, observer }
  return createElement(view.render, componentProps)
}

function applyTestID(result: ReactNode, testID: string | undefined): ReactNode {
  if (testID === undefined || !isValidElement(result)) {
    return result
  }
  return cloneElement(result as ReactElement<{ testID?: string }>, { testID })
}

function bindValues(view: View, args: ViewRenderArguments): RuntimeScope {
  const missingIndex = view.parameters.findIndex((_parameter, index) => index >= args.values.length)
  if (missingIndex >= 0) {
    Errors.ThrowUserInput(`${view.name} is missing required argument "${view.parameters[missingIndex]}"`)
  }
  const scope = Scope(view.scope)
  for (const [index, parameter] of view.parameters.entries()) {
    LetDeclaration(scope, parameter, args.values[index])
  }
  return scope
}

function requireView(value: unknown): View {
  if (!isView(value)) {
    Errors.ThrowUserInput('Cannot render an unknown Tao view.')
  }
  return value
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
