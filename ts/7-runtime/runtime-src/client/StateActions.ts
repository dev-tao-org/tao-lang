import { UserInput } from '@shared'
import React from './Bridge_react/Bridge_react'
import { batch, useValue, useWritable } from './ReactiveEngine'
import { requireScalar, unwrapScalar } from './ScalarValues'
import { defineScopeBinding, hasScopeBinding, LetDeclaration, Scope, ViewRenderBlock } from './Scope'

/** PressHandler invokes a parameterless action for one press. */
export type PressHandler = () => void

/** PressRenderBlock supplies the children and the independent press event of a view invocation. */
export type PressRenderBlock = { children: readonly React.ReactNode[]; press?: PressHandler }

/** useStateDeclaration retains a writable scalar in this view instance and exposes its current value lexically. */
export function useStateDeclaration(scope: Scope, name: string, initialize: () => unknown): void {
  const source = useWritable(() => requireScalar(initialize()))
  useValue(source)
  defineScopeBinding(scope, name, {
    get: () => source.jsValue(),
    set(write) {
      const current = source.jsValue()
      const value = typeof current === 'object' ? write : unwrapScalar(write)
      UserInput.Require(typeof current === typeof value, `Invalid value for state "${name}".`)
      source.update(requireScalar(value))
    },
    enumerable: true,
  })
}

/** SetStatement replaces the value of the nearest writable binding. */
export function SetStatement(scope: Scope, name: string, value: unknown): void {
  if (!hasScopeBinding(scope, name) || !Reflect.set(scope, name, value)) {
    UserInput.Fail(`Cannot set "${name}": it is not writable state.`)
  }
}

/** useActionDeclaration binds a stable action to its view instance's latest committed scope. */
export function useActionDeclaration(
  scope: Scope,
  name: string,
  parameters: readonly string[],
  execute: ActionBody,
): void {
  const invoke = (values: ActionArguments) => execute(bindActionArguments(scope, parameters, values))
  const latest = React.useRef(invoke)
  React.useLayoutEffect(() => {
    latest.current = invoke
  })
  const [action] = React.useState(() => (...values: ActionArguments) => batch(() => latest.current(values)))
  LetDeclaration(scope, name, action)
}

/** DoStatement explicitly calls an action with its evaluated arguments. */
export function DoStatement(candidate: unknown, values: ActionArguments): void {
  requireAction(candidate)(...values)
}

/** InlineAction defers an anonymous action body until invoked. */
export function InlineAction(parent: Scope, execute: ActionBody): PressHandler {
  const captured = captureBindings(parent)
  return () => batch(() => execute(Scope(captured)))
}

/** PressBinding registers a callable without executing it. */
export function PressBinding(bind: BindPress, candidate: unknown): void {
  bind(requireAction(candidate))
}

/** ViewPressBlock evaluates render statements and carries their press binding separately from child nodes. */
export function ViewPressBlock<Parent extends Scope>(
  parent: Parent,
  body: (scope: Parent, children: React.ReactNode[], bindPress: BindPress) => void,
): PressRenderBlock {
  let press: PressRenderBlock['press']
  const children = ViewRenderBlock(parent, (scope, nodes) =>
    body(scope, nodes, handler => {
      press = handler
    }))
  return { children, press }
}

type BindPress = (handler: PressHandler) => void
type ActionArguments = readonly unknown[]
type Action = (...values: ActionArguments) => void
type ActionBody = (scope: Scope) => void
type ParentScope = Scope | null

function captureBindings(scope: Scope): Scope {
  const parent = Object.getPrototypeOf(scope) as ParentScope
  const snapshot = Scope(parent === null ? undefined : captureBindings(parent))
  return Object.defineProperties(snapshot, Object.getOwnPropertyDescriptors(scope))
}

function bindActionArguments(parent: Scope, parameters: readonly string[], values: ActionArguments): Scope {
  const scope = Scope(parent)
  for (const [index, name] of parameters.entries()) {
    LetDeclaration(scope, name, requireScalar(unwrapScalar(values[index])))
  }
  return scope
}

function requireAction(candidate: unknown): Action {
  UserInput.Require(typeof candidate === 'function', 'Expected a Tao action.')
  return candidate as Action
}
