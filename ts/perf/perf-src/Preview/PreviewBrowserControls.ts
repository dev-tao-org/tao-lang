import * as BrowserRuntime from '@shared/os/browser'

/** refreshPreviewControls updates the benchmark button and the preview open control. */
export function refreshPreviewControls(
  status: string,
  scenarioIndex: number,
  scenarios: readonly string[],
  benchmarkUnavailable: boolean,
): void {
  const run = BrowserRuntime.querySelector<HTMLButtonElement>('#run')!
  const open = BrowserRuntime.querySelector<HTMLButtonElement>('#open')!
  const complete = scenarioIndex >= scenarios.length
  run.disabled = complete || benchmarkUnavailable || status !== 'ready'
  open.disabled = status === 'running' || status === 'failed'
  run.textContent = describeRunLabel(complete, status, scenarioIndex, scenarios)
}

function describeRunLabel(
  complete: boolean,
  status: string,
  scenarioIndex: number,
  scenarios: readonly string[],
): string {
  if (complete) {
    return 'Complete'
  }
  if (status === 'running') {
    return `Running ${scenarios[scenarioIndex]}…`
  }
  return scenarioIndex === 0 ? 'Run edit scenarios' : `Run ${scenarios[scenarioIndex]}`
}
