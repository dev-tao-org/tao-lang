import { createElement } from 'react'
import type { ComponentType } from 'react'
import { Scope, Value } from './Scope'
import type { Scope as RuntimeScope } from './Scope'
import { ViewDefinition } from './View'
import type { View } from './View'

/** ForeignViewComponent accepts generated Tao view props without retaining a local implementation. */
export type ForeignViewComponent = ComponentType<never>

/** ForeignView adapts a named React component to Tao's positional view contract. */
export function ForeignView(
  name: string,
  parameters: readonly string[],
  component: ForeignViewComponent,
  scope: RuntimeScope = Scope(),
): View {
  return ViewDefinition(name, parameters, (bindings, children) => {
    const props = Object.fromEntries(parameters.map(parameter => [parameter, Value(bindings, parameter)]))
    return createElement(component as ComponentType<Record<string, unknown>>, props, ...children)
  }, scope)
}
