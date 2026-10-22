import { Tests } from '@shared/os'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ViewComponentProps } from '../../runtime-src/View'
import {
  beginViewRender,
  finishViewRender,
  ViewDeclaration,
  ViewRenderArguments,
  ViewRenderExpression,
} from '../../runtime-src/View'

Tests.test('ViewRenderArguments tags the native root through nested Tao views', () => {
  function NativeRoot({ testID }: { testID?: string }) {
    return createElement('span', { 'data-testid': testID }, 'leaf')
  }
  function Native(props: ViewComponentProps) {
    const context = beginViewRender(props)
    return finishViewRender(context, createElement(NativeRoot))
  }
  function Wrapper(props: ViewComponentProps) {
    const context = beginViewRender(props)
    return finishViewRender(context, ViewRenderExpression(NativeView, ViewRenderArguments()))
  }
  const NativeView = ViewDeclaration('Native', [], Native)
  const WrappedView = ViewDeclaration('Wrapper', [], Wrapper)
  const tagged = renderToStaticMarkup(
    ViewRenderExpression(WrappedView, ViewRenderArguments([], [], 'screen-header')),
  )
  const untagged = renderToStaticMarkup(ViewRenderExpression(WrappedView, ViewRenderArguments()))

  Tests.expect(tagged).toBe('<span data-testid="screen-header">leaf</span>')
  Tests.expect(untagged).toBe('<span>leaf</span>')
})

Tests.test('ViewRenderArguments preserves tagged child identity when siblings reorder', () => {
  const view = ViewDeclaration('Identity', [], () => null)
  const first = ViewRenderExpression(view, ViewRenderArguments([], [], 'item-A'))
  const second = ViewRenderExpression(view, ViewRenderArguments([], [], 'item-B'))
  const original = ViewRenderArguments([], [first, second])
  const reordered = ViewRenderArguments([], [second])
  const untagged = ViewRenderArguments([], [ViewRenderExpression(view, ViewRenderArguments())])

  Tests.expect(original.children.map(child => (child as ReactElement).key)).toEqual(['item-A', 'item-B'])
  Tests.expect(reordered.children.map(child => (child as ReactElement).key)).toEqual(['item-B'])
  Tests.expect(untagged.children.map(child => (child as ReactElement).key)).toEqual(['0'])
})
