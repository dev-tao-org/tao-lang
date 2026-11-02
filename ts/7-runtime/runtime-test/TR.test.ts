import { Tests } from '@shared/os'
import { AppDeclaration } from '../runtime-src/client/App'
import React from '../runtime-src/client/Bridge_react/Bridge_react'
import { ForeignView } from '../runtime-src/client/ForeignView'
import { Name } from '../runtime-src/client/Scope'
import type { ViewComponentProps } from '../runtime-src/client/View'
import * as View from '../runtime-src/client/View'
import { renderToStaticMarkup } from './bridges/Bridge_react-dom'

const neverReady = new Promise<never>(() => {})

Tests.test('ViewRenderExpression renders named components with bound values and children', () => {
  const Message = View.ViewDeclaration('Message', ['Value'], MessageView)
  const Page = View.ViewDeclaration('Page', [], PageView)
  const html = renderToStaticMarkup(
    View.ViewRenderExpression(
      Page,
      View.ViewRenderArguments([], [View.ViewRenderExpression(Message, View.ViewRenderArguments(['hello']))]),
    ),
  )

  Tests.expect(html).toBe('<main><section>hello</section></main>')
})

Tests.test('View hooks run only when its named element is rendered', () => {
  let renders = 0
  function HookView(props: ViewComponentProps) {
    renders++
    const context = View.beginViewRender(props)
    const result = React.createElement('span', null, 'hook owner')
    return View.finishViewRender(context, result)
  }
  const view = View.ViewDeclaration('HookView', [], HookView)
  const element = View.ViewRenderExpression(view, View.ViewRenderArguments())

  Tests.expect(renders).toBe(0)
  Tests.expect(renderToStaticMarkup(element)).toBe('<span>hook owner</span>')
  Tests.expect(renders).toBe(1)
})

Tests.test('ForeignView renders its external component with Tao values as props', () => {
  function DateLabel({ Value }: { Value: string }) {
    const [label] = React.useState(Value)
    return React.createElement('span', null, label)
  }
  const FormattedDate = ForeignView('FormattedDate', ['Value'], DateLabel)
  const html = renderToStaticMarkup(View.ViewRenderExpression(FormattedDate, View.ViewRenderArguments(['Today'])))

  Tests.expect(html).toBe('<span>Today</span>')
})

Tests.test('ViewRenderExpression binds __proto__ as an ordinary value and checks missing arguments', () => {
  const ProtoValue = View.ViewDeclaration('__proto__', ['__proto__'], ProtoValueView)
  const html = renderToStaticMarkup(View.ViewRenderExpression(ProtoValue, View.ViewRenderArguments(['ordinary value'])))
  const Message = View.ViewDeclaration('Message', ['Value'], MessageView)

  Tests.expect(html).toBe('<span>ordinary value</span>')
  Tests.expect(() => renderToStaticMarkup(View.ViewRenderExpression(Message, View.ViewRenderArguments())))
    .toThrow('Message is missing required argument "Value"')
  Tests.expect(() => renderToStaticMarkup(View.ViewRenderExpression(null, View.ViewRenderArguments())))
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
  const Child = View.ViewDeclaration('Child', [], TextChild)
  function RootView(props: ViewComponentProps) {
    const context = View.beginViewRender(props)
    return View.finishViewRender(context, View.ViewRenderExpression(Child, View.ViewRenderArguments()))
  }
  const Root = View.ViewDeclaration('Root', [], RootView)
  const tree = View.ProvideRuntimeObserver(observer, View.ViewRenderExpression(Root, View.ViewRenderArguments()))
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
  const Loading = View.ViewDeclaration('Loading', [], LoadingView)
  const Suspended = View.ViewDeclaration('Suspended', [], SuspendedView)
  const fallback = View.ViewRenderExpression(Loading, View.ViewRenderArguments())
  const markup = renderToStaticMarkup(AppDeclaration(Suspended, 'outer', { observer, fallback }))

  Tests.expect(markup).toContain('loading')
  Tests.expect(phases.filter(phase => phase === 'bind')).toHaveLength(2)
  Tests.expect(phases.filter(phase => phase === 'render')).toHaveLength(1)
  phases.length = 0
  const Nested = View.ViewDeclaration('Nested', [], NestedAppView)
  const nestedMarkup = renderToStaticMarkup(AppDeclaration(Nested, 'outer', { observer }))

  Tests.expect(nestedMarkup).toContain('loading')
  Tests.expect(phases).toEqual(['bind', 'render'])
})

function MessageView(props: ViewComponentProps) {
  const context = View.beginViewRender(props)
  const result = React.createElement('section', null, Name(context.scope, 'Value') as string, ...context.children)
  return View.finishViewRender(context, result)
}

function PageView(props: ViewComponentProps) {
  const context = View.beginViewRender(props)
  return View.finishViewRender(context, React.createElement('main', null, ...context.children))
}

function ProtoValueView(props: ViewComponentProps) {
  const context = View.beginViewRender(props)
  return View.finishViewRender(context, React.createElement('span', null, Name(context.scope, '__proto__') as string))
}

function TextChild(props: ViewComponentProps) {
  const context = View.beginViewRender(props)
  return View.finishViewRender(context, React.createElement('span', null, 'child'))
}

function LoadingView(props: ViewComponentProps) {
  const context = View.beginViewRender(props)
  return View.finishViewRender(context, React.createElement('span', null, 'loading'))
}

function SuspendedView(_props: ViewComponentProps): React.ReactNode {
  throw neverReady
}

function NestedAppView(props: ViewComponentProps) {
  const context = View.beginViewRender(props)
  const suspended = View.ViewDeclaration('Suspended', [], SuspendedView)
  const fallback = View.ViewDeclaration('Loading', [], LoadingView)
  return View.finishViewRender(
    context,
    AppDeclaration(suspended, 'nested', { fallback: View.ViewRenderExpression(fallback, View.ViewRenderArguments()) }),
  )
}
