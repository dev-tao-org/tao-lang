import { Tests } from '@shared/os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Render, ViewDefinition, ViewRenderArgs } from '../../runtime-src/View'

Tests.test('ViewRenderArgs tags the native root through generic Tao views', () => {
  const NativeRoot = ({ testID }: { testID?: string }) => createElement('span', { 'data-testid': testID }, 'leaf')
  const Native = ViewDefinition('Native', [], () => createElement(NativeRoot))
  const Wrapper = ViewDefinition('Wrapper', [], () => Render(Native, ViewRenderArgs()))

  const tagged = renderToStaticMarkup(Render(Wrapper, ViewRenderArgs([], [], 'screen-header')))
  const untagged = renderToStaticMarkup(Render(Wrapper, ViewRenderArgs()))

  Tests.expect(tagged).toBe('<span data-testid="screen-header">leaf</span>')
  Tests.expect(untagged).toBe('<span>leaf</span>')
})
