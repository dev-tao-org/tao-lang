import { Tests } from '@shared/os'
import { createElement, useState } from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppDeclaration } from '../runtime-src/App'
import { ForeignView } from '../runtime-src/ForeignView'
import { LetDeclaration, Name } from '../runtime-src/Scope'
import type { ViewComponentProps } from '../runtime-src/View'
import {
  beginViewRender,
  finishViewRender,
  ProvideRuntimeObserver,
  RenderInjectStatement,
  ViewDeclaration,
  ViewRenderArguments,
  ViewRenderExpression,
} from '../runtime-src/View'

const neverReady = new Promise<never>(() => {})

Tests.test('ViewRenderExpression renders named components with bound values and children', () => {
  const Message = ViewDeclaration('Message', ['Value'], MessageView)
  const Page = ViewDeclaration('Page', [], PageView)
  const html = renderToStaticMarkup(
    ViewRenderExpression(
      Page,
      ViewRenderArguments([], [ViewRenderExpression(Message, ViewRenderArguments(['hello']))]),
    ),
  )

  Tests.expect(html).toBe('<main><section>hello</section></main>')
})

Tests.test('View hooks run only when its named element is rendered', () => {
  let renders = 0
  function HookView(props: ViewComponentProps) {
    renders++
    const context = beginViewRender(props)
    const result = createElement('span', null, 'hook owner')
    return finishViewRender(context, result)
  }
  const view = ViewDeclaration('HookView', [], HookView)
  const element = ViewRenderExpression(view, ViewRenderArguments())

  Tests.expect(renders).toBe(0)
  Tests.expect(renderToStaticMarkup(element)).toBe('<span>hook owner</span>')
  Tests.expect(renders).toBe(1)
})

Tests.test('RenderInjectStatement renders a named hook component with parent-local bindings', () => {
  function Injected(props: ViewComponentProps) {
    const context = beginViewRender(props)
    const [value] = useState(Name(context.scope, 'injected') as string)
    return finishViewRender(context, createElement('span', null, value))
  }
  function Parent(props: ViewComponentProps) {
    const context = beginViewRender(props)
    LetDeclaration(context.scope, 'injected', 'hook result')
    return finishViewRender(context, RenderInjectStatement(context, Injected))
  }
  const view = ViewDeclaration('Parent', [], Parent)

  Tests.expect(renderToStaticMarkup(ViewRenderExpression(view, ViewRenderArguments())))
    .toBe('<span>hook result</span>')
})

Tests.test('ForeignView renders its external component with Tao values as props', () => {
  function DateLabel({ Value }: { Value: string }) {
    const [label] = useState(Value)
    return createElement('span', null, label)
  }
  const FormattedDate = ForeignView('FormattedDate', ['Value'], DateLabel)
  const html = renderToStaticMarkup(ViewRenderExpression(FormattedDate, ViewRenderArguments(['Today'])))

  Tests.expect(html).toBe('<span>Today</span>')
})

Tests.test('ViewRenderExpression binds __proto__ as an ordinary value and checks missing arguments', () => {
  const ProtoValue = ViewDeclaration('__proto__', ['__proto__'], ProtoValueView)
  const html = renderToStaticMarkup(ViewRenderExpression(ProtoValue, ViewRenderArguments(['ordinary value'])))
  const Message = ViewDeclaration('Message', ['Value'], MessageView)

  Tests.expect(html).toBe('<span>ordinary value</span>')
  Tests.expect(() => renderToStaticMarkup(ViewRenderExpression(Message, ViewRenderArguments())))
    .toThrow('Message is missing required argument "Value"')
  Tests.expect(() => renderToStaticMarkup(ViewRenderExpression(null, ViewRenderArguments())))
    .toThrow('Cannot render an unknown Tao view.')
})

Tests.test('View timing follows named nested components under the provided observer', () => {
  let now = 0
  const phases: string[] = []
  const observer = {
    now: () => ++now,
    onTiming(timing: { phase: string }) {
      phases.push(timing.phase)
    },
  }
  const Child = ViewDeclaration('Child', [], TextChild)
  function RootView(props: ViewComponentProps) {
    const context = beginViewRender(props)
    return finishViewRender(context, ViewRenderExpression(Child, ViewRenderArguments()))
  }
  const Root = ViewDeclaration('Root', [], RootView)
  const tree = ProvideRuntimeObserver(observer, ViewRenderExpression(Root, ViewRenderArguments()))
  renderToStaticMarkup(tree)

  Tests.expect(phases.filter(phase => phase === 'bind')).toHaveLength(2)
  Tests.expect(phases.filter(phase => phase === 'render')).toHaveLength(2)
})

Tests.test('AppDeclaration times fallback views and resets inherited observers in nested apps', () => {
  const phases: string[] = []
  const observer = {
    now: () => 0,
    onTiming(timing: { phase: string }) {
      phases.push(timing.phase)
    },
  }
  const Loading = ViewDeclaration('Loading', [], LoadingView)
  const Suspended = ViewDeclaration('Suspended', [], SuspendedView)
  const fallback = ViewRenderExpression(Loading, ViewRenderArguments())
  const markup = renderToStaticMarkup(AppDeclaration(Suspended, 'outer', { observer, fallback }))

  Tests.expect(markup).toContain('loading')
  Tests.expect(phases.filter(phase => phase === 'bind')).toHaveLength(2)
  Tests.expect(phases.filter(phase => phase === 'render')).toHaveLength(1)
  phases.length = 0
  const Nested = ViewDeclaration('Nested', [], NestedAppView)
  const nestedMarkup = renderToStaticMarkup(AppDeclaration(Nested, 'outer', { observer }))

  Tests.expect(nestedMarkup).toContain('loading')
  Tests.expect(phases).toEqual(['bind', 'render'])
})

function MessageView(props: ViewComponentProps) {
  const context = beginViewRender(props)
  const result = createElement('section', null, Name(context.scope, 'Value') as string, ...context.children)
  return finishViewRender(context, result)
}

function PageView(props: ViewComponentProps) {
  const context = beginViewRender(props)
  return finishViewRender(context, createElement('main', null, ...context.children))
}

function ProtoValueView(props: ViewComponentProps) {
  const context = beginViewRender(props)
  return finishViewRender(context, createElement('span', null, Name(context.scope, '__proto__') as string))
}

function TextChild(props: ViewComponentProps) {
  const context = beginViewRender(props)
  return finishViewRender(context, createElement('span', null, 'child'))
}

function LoadingView(props: ViewComponentProps) {
  const context = beginViewRender(props)
  return finishViewRender(context, createElement('span', null, 'loading'))
}

function SuspendedView(_props: ViewComponentProps): ReactNode {
  throw neverReady
}

function NestedAppView(props: ViewComponentProps) {
  const context = beginViewRender(props)
  const suspended = ViewDeclaration('Suspended', [], SuspendedView)
  const fallback = ViewDeclaration('Loading', [], LoadingView)
  return finishViewRender(
    context,
    AppDeclaration(suspended, 'nested', { fallback: ViewRenderExpression(fallback, ViewRenderArguments()) }),
  )
}
