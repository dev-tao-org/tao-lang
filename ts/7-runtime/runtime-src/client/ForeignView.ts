import { Errors } from '@shared'
import React from './Bridge_react/Bridge_react'
import { useReadValues } from './Expressions'
import { Name, Scope } from './Scope'
import type { Scope as RuntimeScope } from './Scope'
import { beginViewRender, finishViewRender, ViewDeclaration } from './View'
import type { View, ViewComponentProps } from './View'

/** ForeignViewComponent is a named React component exposed through Tao's view contract. */
export type ForeignViewComponent = React.ComponentType<never>

/** ForeignView adapts one stable external component to Tao's positional view contract. */
export function ForeignView(
  name: string,
  parameters: readonly string[],
  component: ForeignViewComponent,
  scope: RuntimeScope = Scope(),
): View {
  const descriptor = ViewDeclaration(name, parameters, ForeignViewBody, scope)
  return { ...descriptor, foreignComponent: component }
}

function ForeignViewBody(props: ViewComponentProps): React.ReactNode {
  const context = beginViewRender(props)
  const component = context.view.foreignComponent
  if (!component) {
    Errors.ThrowShouldNeverHappen(`Foreign Tao view "${context.view.name}" has no component.`)
  }
  const parameters = context.view.parameters
  const values = useReadValues(parameters.map(parameter => Name(context.scope, parameter)))
  const valueProps = Object.fromEntries(parameters.map((parameter, index) => [parameter, values[index]]))
  const testIDProps = context.testID === undefined ? {} : { testID: context.testID }
  const element = React.createElement(component as React.ComponentType<Record<string, unknown>>, {
    ...valueProps,
    ...testIDProps,
  }, ...context.children)
  return finishViewRender(context, element)
}
