import React from './Bridge_react/Bridge_react'
import { previewOptions, reportRenderError } from './Preview'
import { ProvideRuntimeObserver, ViewRenderArguments, ViewRenderExpression } from './View'
import type { AppOptions, RuntimeObserver } from './View'

/** AppDeclaration renders a zero-argument root and acknowledges its revision after commit. */
export function AppDeclaration(
  view: unknown,
  revision: string,
  options: AppOptions = previewOptions(),
): React.ReactElement {
  return React.createElement(AppRoot, { view, revision, options })
}

type AppRootProps = {
  view: unknown
  revision: string
  options: AppOptions
}

function AppRoot({ view, revision, options }: AppRootProps): React.ReactNode {
  const observer = options.observer
  const startedAt = observer?.now()
  const subtree = ViewRenderExpression(view, ViewRenderArguments(), observer)
  const content = React.createElement(
    React.Suspense,
    { fallback: options.fallback ?? null },
    React.createElement(CommitAfterRender, { children: subtree, revision, options, observer, startedAt }),
  )
  const observedContent = options.onApplied ? React.createElement(PreviewErrorBoundary, { revision }, content) : content
  return ProvideRuntimeObserver(observer, observedContent)
}

class PreviewErrorBoundary
  extends React.Component<{ revision: string; children?: React.ReactNode }, { revision: string; failed: boolean }>
{
  state = { revision: this.props.revision, failed: false }

  static getDerivedStateFromProps(props: { revision: string }, state: { revision: string; failed: boolean }) {
    return props.revision === state.revision ? null : { revision: props.revision, failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    reportRenderError(this.props.revision, error)
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

type CommitAfterRenderProps = {
  children: React.ReactNode
  revision: string
  options: AppOptions
  observer?: RuntimeObserver
  startedAt?: number
}

function CommitAfterRender(
  { children, revision, options, observer, startedAt }: CommitAfterRenderProps,
): React.ReactNode {
  const onApplied = options.onApplied
  React.useEffect(() => {
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
