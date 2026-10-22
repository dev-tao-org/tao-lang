import { Tests } from '@shared/os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AliasBinding, LetDeclaration, Name, Scope, ViewRenderBlock } from '../../runtime-src/Scope'
import {
  beginViewRender,
  finishViewRender,
  ViewDeclaration,
  ViewRenderArguments,
  ViewRenderExpression,
} from '../../runtime-src/View'
import type { ViewComponentProps } from '../../runtime-src/View'

Tests.test('Scope resolves the nearest lexical definition and preserves parent values', () => {
  const parent = Scope()
  LetDeclaration(parent, 'color', 'blue')
  LetDeclaration(parent, 'size', 'large')
  const child = Scope(parent)
  LetDeclaration(child, 'color', 'red')

  Tests.expect(Name(child, 'color')).toBe('red')
  Tests.expect(Name(child, 'size')).toBe('large')
  Tests.expect(Name(parent, 'color')).toBe('blue')
})

Tests.test('Scope rejects missing and duplicate own definitions while allowing shadowing', () => {
  const parent = Scope()
  LetDeclaration(parent, 'item', 'parent')
  const child = Scope(parent)
  LetDeclaration(child, 'item', 'child')

  Tests.expect(() => Name(child, 'missing')).toThrow('Undefined name "missing"')
  Tests.expect(() => LetDeclaration(child, 'item', 'duplicate')).toThrow('Name "item" is already defined')
})

Tests.test('Scope treats __proto__ as an ordinary definition', () => {
  const scope = Scope()
  LetDeclaration(scope, '__proto__', 'ordinary')

  Tests.expect(Name(scope, '__proto__')).toBe('ordinary')
  Tests.expect(Object.getPrototypeOf(scope)).toBeNull()
})

Tests.test('Scope resolves lazy imported aliases after every module scope exists', () => {
  const source = Scope()
  const importer = Scope()
  let reads = 0
  AliasBinding(importer, 'UI.Caption', () => {
    reads += 1
    return Name(source, 'Caption')
  })

  Tests.expect(reads).toBe(0)
  LetDeclaration(source, 'Caption', 'from source')
  Tests.expect(Name(importer, 'UI.Caption')).toBe('from source')
  Tests.expect(reads).toBe(1)
})

Tests.test('ViewRenderBlock gives its body a child scope and ordered output array', () => {
  const parent = Scope()
  LetDeclaration(parent, 'label', 'outer')
  let found = ''
  const children = ViewRenderBlock(parent, (scope, output) => {
    LetDeclaration(scope, 'label', 'inner')
    found = Name(scope, 'label') as string
    output.push(createElement('span', { key: 'child' }, 'child'))
  })

  Tests.expect(found).toBe('inner')
  Tests.expect(Name(parent, 'label')).toBe('outer')
  Tests.expect(renderToStaticMarkup(createElement('div', null, ...children))).toBe('<div><span>child</span></div>')
})

Tests.test('View parameters shadow captured parent scope during rendering', () => {
  const parent = Scope()
  LetDeclaration(parent, 'message', 'captured')
  function Message(props: ViewComponentProps) {
    const context = beginViewRender(props)
    const result = createElement('span', null, Name(context.scope, 'message') as string)
    return finishViewRender(context, result)
  }
  const descriptor = ViewDeclaration(
    'Message',
    ['message'],
    Message,
    parent,
  )

  const html = renderToStaticMarkup(ViewRenderExpression(descriptor, ViewRenderArguments(['parameter'])))

  Tests.expect(html).toBe('<span>parameter</span>')
})

Tests.test('beginViewRender creates fresh local scope while retaining bound values', () => {
  const parent = Scope()
  LetDeclaration(parent, 'captured', 'outer')
  const view = ViewDeclaration('ScopeOwner', [], ScopeOwnerView, parent)
  const props: ViewComponentProps = { view, scope: parent, children: [] }
  const first = beginViewRender(props)
  LetDeclaration(first.scope, 'local', 'first render')
  const next = beginViewRender(props)

  Tests.expect(Name(next.scope, 'captured')).toBe('outer')
  Tests.expect(() => Name(next.scope, 'local')).toThrow('Undefined name "local"')
  Tests.expect(() => Name(parent, 'local')).toThrow('Undefined name "local"')
})

Tests.test('Name resolves a view from its owning scope and rendering validates unknown values', () => {
  const scope = Scope()
  function ScreenView(props: ViewComponentProps) {
    const context = beginViewRender(props)
    return finishViewRender(context, null)
  }
  const Screen = ViewDeclaration('Screen', [], ScreenView, scope)
  LetDeclaration(scope, 'Screen', Screen)

  Tests.expect(Name(scope, 'Screen')).toBe(Screen)
  Tests.expect(() => Name(scope, 'Missing')).toThrow('Undefined name "Missing"')
  Tests.expect(() => renderToStaticMarkup(ViewRenderExpression('wrong', ViewRenderArguments())))
    .toThrow('Cannot render an unknown Tao view.')
})

function ScopeOwnerView(props: ViewComponentProps) {
  const context = beginViewRender(props)
  return finishViewRender(context, null)
}
