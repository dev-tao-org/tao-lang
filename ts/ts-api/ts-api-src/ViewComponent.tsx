import React from '@runtime/client/Bridge_react/Bridge_react'
import { ViewRenderArguments, ViewRenderExpression } from '@runtime/client/View'
import { Errors } from '@shared'
import type { Library } from './Library'

/** ViewProps accepts ordinary React children at the external view boundary. */
export type ViewProps = { children?: React.ReactNode }

/** createViewComponent creates a stable typed component resolving its library's nearest instance. */
export function createViewComponent<Props extends ViewProps>(
  library: Library,
  path: string,
  parameters: readonly (keyof Props)[],
): React.ComponentType<Props> {
  return function PublishedView(props: Props) {
    const instance = library.useInstance()
    const view = instance.views[path]
    if (!view) {
      Errors.ThrowShouldNeverHappen(`Published Tao view is missing: ${path}.`)
    }
    const values = parameters.map(parameter => props[parameter])
    const children = React.Children.toArray(props.children)
    return ViewRenderExpression(view, ViewRenderArguments(values, children))
  }
}
