import { Errors, Objects } from '@shared'
import React from './Bridge_react/Bridge_react'
import { LetDeclaration, Scope } from './Scope'
import type { Scope as RuntimeScope } from './Scope'
import type { PressHandler, PressRenderBlock } from './StateActions'

/** View identifies a named component, its positional parameters and captured lexical scope. */
export type View = {
  readonly name: string
  readonly parameters: readonly string[]
  readonly render: React.ComponentType<ViewComponentProps>
  readonly scope: RuntimeScope
  readonly foreignComponent?: React.ComponentType<never>
  readonly [viewMarker]: true
}

/** ViewComponentProps carries one bound Tao view into its named React component. */
export type ViewComponentProps = {
  readonly view: View
  readonly scope: RuntimeScope
  readonly children: readonly React.ReactNode[]
  readonly testID?: string
  readonly press?: PressHandler
  readonly observer?: RuntimeObserver
}

/** ViewRenderContext keeps bound values and timing around one component render. */
export type ViewRenderContext = ViewComponentProps & { readonly startedAt?: number }

/** ViewRenderArguments holds positional values, ordered children and an optional native tag. */
export type ViewRenderArguments = {
  readonly values: readonly unknown[]
  readonly children: readonly React.ReactNode[]
  readonly testID?: string
  readonly press?: PressHandler
}

/** AppOptions configures the preview acknowledgement and runtime timings. */
export type AppOptions = {
  onApplied?(revision: string): void
  observer?: RuntimeObserver
  fallback?: React.ReactNode
}

/** RuntimeTiming describes one measured runtime phase. */
export type RuntimeTiming = {
  phase: ViewRenderPhase
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
  render: React.ComponentType<ViewComponentProps>,
  scope: RuntimeScope = Scope(),
): View {
  return { name, parameters: [...parameters], render, scope, [viewMarker]: true }
}

/** ViewRenderArguments packages positional values, children and an optional test identifier. */
export function ViewRenderArguments(
  values: readonly unknown[] = [],
  inputChildren: readonly React.ReactNode[] = [],
  testID?: string,
): ViewRenderArguments {
  const children = inputChildren.map((child, index) =>
    React.isValidElement(child) ? React.cloneElement(child, { key: child.key ?? index }) : child
  )
  return { values, testID, children }
}

/** ViewPressArguments carries a render block's press handler alongside ordinary view arguments. */
export function ViewPressArguments(
  values: readonly unknown[],
  block: PressRenderBlock,
  testID?: string,
): ViewRenderArguments {
  return { ...ViewRenderArguments(values, block.children, testID), press: block.press }
}

/** ViewRenderExpression creates an element for a named view resolved from a Tao scope. */
export function ViewRenderExpression(
  candidate: unknown,
  args: ViewRenderArguments,
  observer?: RuntimeObserver,
): React.ReactElement {
  const body = React.createElement(ViewBody, { candidate, args, key: args.testID })
  return observer ? ProvideRuntimeObserver(observer, body) : body
}

/** beginViewRender starts timing and exposes the already bound component inputs. */
export function beginViewRender(props: ViewComponentProps): ViewRenderContext {
  const startedAt = props.observer?.now()
  return { ...props, scope: Scope(props.scope), startedAt }
}

/** finishViewRender reports this component's time and tags its returned native root. */
export function finishViewRender(context: ViewRenderContext, result: React.ReactNode): React.ReactNode {
  observe(context.observer, 'render', context.startedAt)
  return applyTestID(result, context.testID)
}

/** ProvideRuntimeObserver sets the timing observer for a runtime subtree. */
export function ProvideRuntimeObserver(
  observer: OptionalRuntimeObserver,
  children: React.ReactNode,
): React.ReactElement {
  return React.createElement(RuntimeObserverContext.Provider, { value: observer }, children)
}

const viewMarker: unique symbol = Symbol('TaoView')
const RuntimeObserverContext = React.createContext<OptionalRuntimeObserver>(undefined)

type ViewBodyProps = { candidate: unknown; args: ViewRenderArguments; testID?: string }

function ViewBody({ candidate, args, testID }: ViewBodyProps): React.ReactElement {
  const view = requireView(candidate)
  const observer = React.useContext(RuntimeObserverContext)
  const bindingStartedAt = observer?.now()
  const scope = bindValues(view, args)
  observe(observer, 'bind', bindingStartedAt)
  const testId = args.testID ?? testID
  const componentProps = { view, scope, children: args.children, testID: testId, observer, press: args.press }
  return React.createElement(view.render, componentProps)
}

type OptionalTestID = string | undefined
function applyTestID(result: React.ReactNode, testID: OptionalTestID): React.ReactNode {
  if (testID === undefined || !React.isValidElement(result)) {
    return result
  }
  return React.cloneElement(result as React.ReactElement<{ testID?: string }>, { testID })
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
  return Objects.isObject(value) && viewMarker in value
}

type OptionalRenderStartTime = number | undefined
function observe(
  observer: OptionalRuntimeObserver,
  phase: RuntimeTiming['phase'],
  startedAt: OptionalRenderStartTime,
): void {
  if (!observer || startedAt === undefined) {
    return
  }
  observer.onTiming({ phase, durationMs: observer.now() - startedAt })
}

type ViewRenderPhase = 'bind' | 'render' | 'render-to-applied'
type OptionalRuntimeObserver = RuntimeObserver | undefined
