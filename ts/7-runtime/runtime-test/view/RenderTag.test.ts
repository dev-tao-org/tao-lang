import { Tests } from '@shared/os'
import { renderToStaticMarkup } from 'react-dom/server'
import React from '../../runtime-src/client/Bridge-React'
import type { ViewComponentProps } from '../../runtime-src/client/View'
import * as View from '../../runtime-src/client/View'

Tests.test('ViewRenderArguments tags the native root through nested Tao views', () => {
  function NativeRoot({ testID }: { testID?: string }) {
    return React.createElement('span', { 'data-testid': testID }, 'leaf')
  }
  function Native(props: ViewComponentProps) {
    const context = View.beginViewRender(props)
    return View.finishViewRender(context, React.createElement(NativeRoot))
  }
  function Wrapper(props: ViewComponentProps) {
    const context = View.beginViewRender(props)
    return View.finishViewRender(context, View.ViewRenderExpression(NativeView, View.ViewRenderArguments()))
  }
  const NativeView = View.ViewDeclaration('Native', [], Native)
  const WrappedView = View.ViewDeclaration('Wrapper', [], Wrapper)
  const tagged = renderToStaticMarkup(
    View.ViewRenderExpression(WrappedView, View.ViewRenderArguments([], [], 'screen-header')),
  )
  const untagged = renderToStaticMarkup(View.ViewRenderExpression(WrappedView, View.ViewRenderArguments()))

  Tests.expect(tagged).toBe('<span data-testid="screen-header">leaf</span>')
  Tests.expect(untagged).toBe('<span>leaf</span>')
})

Tests.test('ViewRenderArguments preserves tagged child identity when siblings reorder', () => {
  const view = View.ViewDeclaration('Identity', [], () => null)
  const first = View.ViewRenderExpression(view, View.ViewRenderArguments([], [], 'item-A'))
  const second = View.ViewRenderExpression(view, View.ViewRenderArguments([], [], 'item-B'))
  const original = View.ViewRenderArguments([], [first, second])
  const reordered = View.ViewRenderArguments([], [second])
  const untagged = View.ViewRenderArguments([], [View.ViewRenderExpression(view, View.ViewRenderArguments())])

  Tests.expect(original.children.map(child => (child as React.ReactElement).key)).toEqual(['item-A', 'item-B'])
  Tests.expect(reordered.children.map(child => (child as React.ReactElement).key)).toEqual(['item-B'])
  Tests.expect(untagged.children.map(child => (child as React.ReactElement).key)).toEqual(['0'])
})
