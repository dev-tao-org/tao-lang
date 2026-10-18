import { Tests } from '@shared/os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Render, ViewDefinition, ViewRenderArgs } from '../runtime-src/View'

Tests.test('Render binds positional view values and supplies children', () => {
  const Message = ViewDefinition(
    'Message',
    ['Value'],
    ({ Value }, Children) => createElement('section', null, Value as string, ...Children),
  )
  const page = ViewDefinition('Page', [], (_bindings, Children) => createElement('main', null, ...Children))
  const html = renderToStaticMarkup(
    Render(
      page,
      ViewRenderArgs([], [Render(Message, ViewRenderArgs(['hello']))]),
    ),
  )

  Tests.expect(html).toContain('<main><section>hello</section></main>')
})

Tests.test('Render binds the legal __proto__ parameter as an ordinary value', () => {
  const ProtoValue = ViewDefinition(
    'ProtoValue',
    ['__proto__'],
    bindings => createElement('span', null, bindings['__proto__'] as string),
  )

  const html = renderToStaticMarkup(Render(ProtoValue, ViewRenderArgs(['ordinary value'])))

  Tests.expect(html).toBe('<span>ordinary value</span>')
})

Tests.test('Render reports missing positional view arguments', () => {
  const Message = ViewDefinition('Message', ['Value'], ({ Value }) => createElement('span', null, Value as string))

  Tests.expect(() => renderToStaticMarkup(Render(Message, ViewRenderArgs()))).toThrow(
    'Message is missing required argument "Value"',
  )
  Tests.expect(() => renderToStaticMarkup(Render(null as never, ViewRenderArgs()))).toThrow(
    'Cannot render an unknown Tao view.',
  )
})

Tests.test('Render shares its timing observer with nested Render calls', () => {
  let now = 0
  const phases: string[] = []
  const Child = ViewDefinition('Child', [], () => createElement('span', null, 'child'))
  const Root = ViewDefinition('Root', [], () => Render(Child, ViewRenderArgs()))
  const observer = {
    now: () => ++now,
    onTiming(timing: { phase: string }) {
      phases.push(timing.phase)
    },
  }
  renderToStaticMarkup(Render(Root, ViewRenderArgs(), observer))

  Tests.expect(phases.filter(phase => phase === 'bind')).toHaveLength(2)
  Tests.expect(phases.filter(phase => phase === 'render')).toHaveLength(2)
})
