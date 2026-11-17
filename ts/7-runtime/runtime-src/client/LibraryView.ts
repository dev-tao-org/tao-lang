import React from './Bridge_react/Bridge_react'
import { type View, ViewRenderArguments, ViewRenderExpression } from './View'

/** LibraryViewProps accepts ordinary React children at a published Tao view's boundary. */
export type LibraryViewProps = { children?: React.ReactNode }

/** LibraryView exposes a view in the library's initialized scope as a React component. */
export function LibraryView<Props extends LibraryViewProps>(
  view: View,
  parameters: readonly (keyof Props)[],
  props: Props,
): React.ReactNode {
  const values = parameters.map(parameter => props[parameter])
  const children = React.Children.toArray(props.children)
  return ViewRenderExpression(view, ViewRenderArguments(values, children))
}
