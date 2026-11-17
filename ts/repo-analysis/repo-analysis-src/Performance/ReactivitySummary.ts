/** ReactivitySummary describes durations and observed work for one benchmark scenario. */
export type ReactivitySummary = {
  candidate: string
  scenario: string
  samples: number
  medianMs: number
  p95Ms: number
  evaluations: number[]
  notifications: number[]
}

type ReactivitySample = { durationMs: number; evaluations: number; notifications: number }

/** summarizeReactivity projects one selected group without changing its recorded work order. */
export function summarizeReactivity(
  candidate: string,
  scenario: string,
  samples: readonly ReactivitySample[],
): ReactivitySummary {
  const durations = samples.map(sample => sample.durationMs).toSorted((left, right) => left - right)
  return {
    candidate,
    scenario,
    samples: samples.length,
    medianMs: durations[Math.floor(durations.length / 2)]!,
    p95Ms: durations[Math.ceil(durations.length * 0.95) - 1]!,
    evaluations: samples.map(sample => sample.evaluations),
    notifications: samples.map(sample => sample.notifications),
  }
}
