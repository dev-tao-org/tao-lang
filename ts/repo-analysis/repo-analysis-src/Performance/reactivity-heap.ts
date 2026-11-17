import * as Client from '@runtime/client'
import { JavaScriptHeap } from '@shared/os'

/** ReactiveHeapCandidate identifies the graph policy retained for heap sampling. */
export type ReactiveHeapCandidate = {
  name: string
  strategy: ReactiveReadStrategy
  retainIntermediate?: boolean
}

type ReactiveReadStrategy = 'native-lazy' | 'uncached-public-read'

/** ReactiveHeapSample records retained heap state and collection durations for one repetition. */
export type ReactiveHeapSample = {
  candidate: string
  repetition: number
  graphCount: number
  expressions: number
  observations: number
  baseline: JavaScriptHeap.Snapshot
  retained: JavaScriptHeap.Snapshot
  retainedDelta: JavaScriptHeap.Snapshot
  afterDisposeForcedGC: JavaScriptHeap.Snapshot
  afterDisposeDelta: JavaScriptHeap.Snapshot
  afterDisposeGCms: number
  afterTimedSweep: JavaScriptHeap.Snapshot
  sweepDurationMs: number
}

/** measureReactiveHeapRetention samples graph retention separately from timed policy workloads. */
export function measureReactiveHeapRetention(
  candidates: readonly ReactiveHeapCandidate[],
  repetitions = 5,
): ReactiveHeapSample[] {
  const samples: ReactiveHeapSample[] = []
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const ordered = repetition % 2 === 0 ? candidates : candidates.toReversed()
    for (const candidate of ordered) {
      samples.push(measureCandidate(candidate, repetition))
    }
  }
  return samples
}

function measureCandidate(candidate: ReactiveHeapCandidate, repetition: number): ReactiveHeapSample {
  JavaScriptHeap.forceCollection()
  const baseline = JavaScriptHeap.snapshot()
  const releaseGraphs = createRetainedGraphs(candidate)
  JavaScriptHeap.forceCollection()
  const retained = JavaScriptHeap.snapshot()
  releaseGraphs()
  const afterDisposeGCms = JavaScriptHeap.forceCollection()
  const afterDisposeForcedGC = JavaScriptHeap.snapshot()
  const sweep = JavaScriptHeap.collectAndSweep()
  return {
    candidate: candidate.name,
    repetition,
    graphCount,
    expressions: graphCount * 3,
    observations: graphCount * (1 + Number(candidate.retainIntermediate === true)),
    baseline,
    retained,
    retainedDelta: subtract(retained, baseline),
    afterDisposeForcedGC,
    afterDisposeDelta: subtract(afterDisposeForcedGC, baseline),
    afterDisposeGCms,
    afterTimedSweep: sweep.snapshot,
    sweepDurationMs: sweep.durationMs,
  }
}

const graphCount = 1000

function createRetainedGraphs(candidate: ReactiveHeapCandidate): () => void {
  const releaseGraphs: (() => void)[] = []
  for (let index = 0; index < graphCount; index++) {
    releaseGraphs.push(createRetainedGraph(candidate))
  }
  return () => {
    releaseGraphs.forEach(releaseGraph => releaseGraph())
    releaseGraphs.length = 0
  }
}

function createRetainedGraph(candidate: ReactiveHeapCandidate): () => void {
  const engine = Client.createReactiveEngine({ strategy: candidate.strategy })
  const source = engine.createWritable(1)
  const intermediate = engine.createComputed(() => source.jsValue() * 2)
  const result = engine.createComputed(() => intermediate.jsValue() + 1)
  const observations = [result.observe(() => {})]
  if (candidate.retainIntermediate) {
    observations.push(intermediate.observe(() => {}))
  }
  result.jsValue()
  return () => {
    observations.forEach(observation => observation.unobserve())
    engine.dispose()
    void source
    void intermediate
    void result
  }
}

function subtract(current: JavaScriptHeap.Snapshot, baseline: JavaScriptHeap.Snapshot): JavaScriptHeap.Snapshot {
  return { heapBytes: current.heapBytes - baseline.heapBytes, liveCells: current.liveCells - baseline.liveCells }
}
