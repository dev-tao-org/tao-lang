/** PairedTimingInterval bounds the population median time difference across independent pairs. */
export type PairedTimingInterval = { lowerMs: number; upperMs: number; coverage: number }

/** estimatePairedTimingInterval uses the exact two-sided sign interval for a median. */
export function estimatePairedTimingInterval(deltas: readonly number[]): PairedTimingInterval | undefined {
  const sorted = deltas.toSorted((left, right) => left - right)
  const tail = findAcceptedTail(sorted.length)
  if (tail === undefined) {
    return undefined
  }
  return {
    lowerMs: sorted[tail.rank],
    upperMs: sorted[sorted.length - 1 - tail.rank],
    coverage: 1 - 2 * tail.probability,
  }
}

type AcceptedTail = { rank: number; probability: number }
type OptionalAcceptedTail = AcceptedTail | undefined
const TailLimit = 0.025

function findAcceptedTail(pairs: number): AcceptedTail | undefined {
  let tail: OptionalAcceptedTail
  let probability = 0
  let logMass = -pairs * Math.LN2
  for (let rank = 0; rank < pairs / 2; rank++) {
    probability += Math.exp(logMass)
    if (probability > TailLimit) {
      break
    }
    tail = { rank, probability }
    logMass += Math.log(pairs - rank) - Math.log(rank + 1)
  }
  return tail
}
