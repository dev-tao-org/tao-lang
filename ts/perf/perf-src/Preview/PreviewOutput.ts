import type { TimingSample } from '@shared'

type OutputTiming = {
  revision: string
  saveToHmrMs: number
  saveToAppliedMs: number
  pipeline: readonly TimingSample[]
}
type OutputCapture<Timing> = {
  results: readonly { scenario: string; revision: string }[]
  reloads: readonly Timing[]
}
/** describePreviewOutput joins browser scenarios to compiler save timings by revision. */
export function describePreviewOutput<Timing extends OutputTiming>(capture: OutputCapture<Timing>) {
  return capture.results.map(result => {
    const timing = capture.reloads.findLast(timing => timing.revision === result.revision)
    return { scenario: result.scenario, timing }
  })
}
