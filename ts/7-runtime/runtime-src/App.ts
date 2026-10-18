import { createElement, Suspense, useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { previewOptions } from './Preview'
import { ProvideRuntimeObserver, Render, ViewRenderArgs } from './View'
import type { AppOptions, RuntimeObserver, View } from './View'

/** App renders a zero-argument root and acknowledges its revision after commit. */
export function App(view: View, revision: string, options: AppOptions = previewOptions()): ReactElement {
  return createElement(AppRoot, { view, revision, options })
}

type AppRootProps = {
  view: View
  revision: string
  options: AppOptions
}

function AppRoot({ view, revision, options }: AppRootProps): ReactNode {
  const observer = options.observer
  const startedAt = observer?.now()
  const subtree = Render(view, ViewRenderArgs(), observer)
  return ProvideRuntimeObserver(
    observer,
    createElement(
      Suspense,
      { fallback: options.fallback ?? null },
      createElement(CommitAfterRender, { children: subtree, revision, options, observer, startedAt }),
    ),
  )
}

type CommitAfterRenderProps = {
  children: ReactNode
  revision: string
  options: AppOptions
  observer?: RuntimeObserver
  startedAt?: number
}

function CommitAfterRender({ children, revision, options, observer, startedAt }: CommitAfterRenderProps): ReactNode {
  const onApplied = options.onApplied
  useEffect(() => {
    observe(observer, 'render-to-applied', startedAt)
    onApplied?.(revision)
  }, [observer, onApplied, revision])
  return children
}

function observe(
  observer: RuntimeObserver | undefined,
  phase: 'render-to-applied',
  startedAt: number | undefined,
): void {
  if (!observer || startedAt === undefined) {
    return
  }
  observer.onTiming({ phase, durationMs: observer.now() - startedAt })
}
