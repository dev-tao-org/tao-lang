import { Tests } from '@shared/os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LetDefinition, LetReference, RenderChildren, Scope, Value } from '../../runtime-src/Scope'
import { Render, ViewDefinition, ViewReference, ViewRenderArgs } from '../../runtime-src/View'

Tests.test('Scope resolves the nearest lexical definition and preserves parent values', () => {
  const parent = Scope()
  LetDefinition(parent, 'color', 'blue')
  LetDefinition(parent, 'size', 'large')
  const child = Scope(parent)
  LetDefinition(child, 'color', 'red')

  Tests.expect(Value(child, 'color')).toBe('red')
  Tests.expect(Value(child, 'size')).toBe('large')
  Tests.expect(Value(parent, 'color')).toBe('blue')
})

Tests.test('Scope rejects missing and duplicate own definitions while allowing shadowing', () => {
  const parent = Scope()
  LetDefinition(parent, 'item', 'parent')
  const child = Scope(parent)
  LetDefinition(child, 'item', 'child')

  Tests.expect(() => Value(child, 'missing')).toThrow('Undefined name "missing"')
  Tests.expect(() => LetDefinition(child, 'item', 'duplicate')).toThrow('Name "item" is already defined')
})

Tests.test('Scope treats __proto__ as an ordinary definition', () => {
  const scope = Scope()
  LetDefinition(scope, '__proto__', 'ordinary')

  Tests.expect(Value(scope, '__proto__')).toBe('ordinary')
  Tests.expect(Object.getPrototypeOf(scope)).toBeNull()
})

Tests.test('Scope resolves lazy imported aliases after every module scope exists', () => {
  const source = Scope()
  const importer = Scope()
  let reads = 0
  LetReference(importer, 'UI.Caption', () => {
    reads += 1
    return Value(source, 'Caption')
  })

  Tests.expect(reads).toBe(0)
  LetDefinition(source, 'Caption', 'from source')
  Tests.expect(Value(importer, 'UI.Caption')).toBe('from source')
  Tests.expect(reads).toBe(1)
})

Tests.test('RenderChildren gives its body a child scope and ordered output array', () => {
  const parent = Scope()
  LetDefinition(parent, 'label', 'outer')
  let found = ''
  const children = RenderChildren(parent, (scope, output) => {
    LetDefinition(scope, 'label', 'inner')
    found = Value(scope, 'label') as string
    output.push(createElement('span', { key: 'child' }, 'child'))
  })

  Tests.expect(found).toBe('inner')
  Tests.expect(Value(parent, 'label')).toBe('outer')
  Tests.expect(renderToStaticMarkup(createElement('div', null, ...children))).toBe('<div><span>child</span></div>')
})

Tests.test('View parameters shadow captured parent scope during rendering', () => {
  const parent = Scope()
  LetDefinition(parent, 'message', 'captured')
  const Message = ViewDefinition(
    'Message',
    ['message'],
    bindings => createElement('span', null, bindings.message as string),
    parent,
  )

  const html = renderToStaticMarkup(Render(Message, ViewRenderArgs(['parameter'])))

  Tests.expect(html).toBe('<span>parameter</span>')
})

Tests.test('ViewReference resolves a view from its owning scope', () => {
  const scope = Scope()
  const View = ViewDefinition('Screen', [], () => null, scope)
  LetDefinition(scope, 'Screen', View)

  Tests.expect(ViewReference(scope, 'Screen')).toBe(View)
  Tests.expect(() => ViewReference(scope, 'Missing')).toThrow('Unknown Tao view: Missing.')
})
