import { createReactiveEngine, type ReactiveEngine, type ReactiveEngineOptions } from '@runtime/ReactiveEngine'
import { Errors, Time, Try } from '@shared'
import { Artifacts, Platform, Repo } from '@shared/os'
import { measureReactiveHeapRetention } from './reactivity-heap'

/** reactivityPerformance compares Tao provider work and notification policies without claiming preview speed. */
export async function reactivityPerformance() {
  const samples = collectSamples()
  const summary = summarize(samples)
  const heapCandidates = candidates.filter(candidate => !candidate.deferred)
  const heapRetention = measureReactiveHeapRetention(heapCandidates)
  const path = Artifacts.resolvePath('logs/performance', `reactivity-${Platform.randomUUID()}.json`)
  await Artifacts.mkdir(Artifacts.resolvePath('logs/performance'), { recursive: true })
  await Artifacts.write(
    path,
    JSON.stringify(
      {
        version: 2,
        commit: await Platform.capture('git rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
        modified: await Platform.capture('git status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
        system: Platform.systemInfo(),
        definitions: {
          samples: 'Two unrecorded warmups, then seven alternating samples of 1000 operations per case.',
          computation: 'Observed eager retains the intermediate expression through an explicit observation.',
          deferred: 'Delivery-only queued scheduling; computations still use native synchronous settlement.',
          allocation:
            'Timed cases count explicit Tao expressions and observations. Separate heap samples report live JavaScriptCore heap and cell deltas; cumulative allocation counts are unavailable.',
          heapRetention:
            'Five alternating repetitions per synchronous candidate retain 1000 independent three-expression graphs. Deferred queues are excluded. Snapshots follow forced collections; disposal deltas include report and measurement overhead.',
          boundary: 'Synthetic runtime operations, not Metro, React rendering, preview latency or physical paint.',
          deferredComputation: 'Not supplied: the provider public API does not expose a deferred evaluation scheduler.',
        },
        summary,
        samples,
        heapRetention,
      },
      null,
      2,
    ),
  )
  return { path, summary, heapRetention }
}

type Scenario = 'unchanged-reads' | 'observed-writes' | 'batched-writes' | 'create-dispose'
type Candidate = {
  name: string
  strategy: NonNullable<ReactiveEngineOptions['strategy']>
  deferred: boolean
  retainIntermediate?: boolean
}
type Sample = {
  candidate: string
  scenario: Scenario
  durationMs: number
  operations: number
  evaluations: number
  notifications: number
  expressions: number
  observations: number
}

const operations = 1000
const candidates: readonly Candidate[] = [
  { name: 'native-lazy/synchronous', strategy: 'native-lazy', deferred: false },
  { name: 'uncached-public-read/synchronous', strategy: 'uncached-public-read', deferred: false },
  { name: 'observed-eager/synchronous', strategy: 'native-lazy', deferred: false, retainIntermediate: true },
  { name: 'native-lazy/deferred-delivery', strategy: 'native-lazy', deferred: true },
]
const scenarios: readonly Scenario[] = ['unchanged-reads', 'observed-writes', 'batched-writes', 'create-dispose']

function collectSamples(): Sample[] {
  const samples: Sample[] = []
  for (let pass = -2; pass < 7; pass++) {
    const ordered = pass % 2 === 0 ? candidates : candidates.toReversed()
    for (const candidate of ordered) {
      for (const scenario of scenarios) {
        const sample = measureScenario(candidate, scenario)
        if (pass >= 0) {
          samples.push(sample)
        }
      }
    }
  }
  return samples
}

function measureScenario(candidate: Candidate, scenario: Scenario): Sample {
  if (scenario === 'create-dispose') {
    return measureConstruction(candidate)
  }
  const pending: (() => void)[] = []
  const engine = createReactiveEngine({
    strategy: candidate.strategy,
    scheduleDelivery: candidate.deferred ? deliver => pending.push(deliver) : undefined,
  })
  return Try(() => measureEngine(engine, candidate, scenario, pending), { finally: () => engine.dispose() })
}

function measureEngine(
  engine: ReactiveEngine,
  candidate: Candidate,
  scenario: Scenario,
  pending: (() => void)[],
): Sample {
  let evaluations = 0
  let notifications = 0
  const { source, intermediate, result } = createExpressionChain(engine, 1, () => evaluations++)
  const observations = scenario === 'unchanged-reads' ? 0 : 1
  if (observations) {
    result.observe(() => notifications++)
  }
  const retained = candidate.retainIntermediate ? intermediate.observe(() => {}) : undefined
  const initialEvaluations = evaluations
  const initialNotifications = notifications
  const startedAt = Time.nowMs()
  executeScenario(engine, scenario, source.update, result.jsValue)
  while (pending.length > 0) {
    pending.splice(0).forEach(deliver => deliver())
  }
  const durationMs = Time.nowMs() - startedAt
  const measuredEvaluations = evaluations - initialEvaluations
  const measuredNotifications = notifications - initialNotifications
  const expected = scenario === 'unchanged-reads' ? 3 : operations * 2 + 1
  if (result.jsValue() !== expected) {
    Errors.ThrowShouldNeverHappen('Reactive benchmark produced a stale result.')
  }
  retained?.unobserve()
  return {
    candidate: candidate.name,
    scenario,
    durationMs,
    operations,
    evaluations: measuredEvaluations,
    notifications: measuredNotifications,
    expressions: 3,
    observations: observations + Number(retained !== undefined),
  }
}

function createExpressionChain(engine: ReactiveEngine, initial: number, countEvaluation: () => void) {
  const source = engine.createWritable(initial)
  const intermediate = engine.createComputed(() => {
    countEvaluation()
    return source.jsValue() * 2
  })
  const result = engine.createComputed(() => {
    countEvaluation()
    return intermediate.jsValue() + 1
  })
  return { source, intermediate, result }
}

function measureConstruction(candidate: Candidate): Sample {
  let evaluations = 0
  const startedAt = Time.nowMs()
  for (let index = 0; index < operations; index++) {
    const engine = createReactiveEngine({ strategy: candidate.strategy })
    Try(() => {
      const { result } = createExpressionChain(engine, index, () => evaluations++)
      if (result.jsValue() !== index * 2 + 1) {
        Errors.ThrowShouldNeverHappen('Constructed expression is stale.')
      }
    }, { finally: () => engine.dispose() })
  }
  return {
    candidate: candidate.name,
    scenario: 'create-dispose',
    durationMs: Time.nowMs() - startedAt,
    operations,
    evaluations,
    notifications: 0,
    expressions: operations * 3,
    observations: 0,
  }
}

function executeScenario(
  engine: ReactiveEngine,
  scenario: Scenario,
  update: (value: number) => void,
  read: () => number,
): void {
  for (let index = 1; index <= operations; index++) {
    if (scenario === 'unchanged-reads') {
      read()
    } else if (scenario === 'batched-writes') {
      engine.batch(() => {
        update(-index)
        if (read() !== -index * 2 + 1) {
          Errors.ThrowShouldNeverHappen('Batch reads lost fresh values.')
        }
        update(index)
      })
    } else {
      update(index)
    }
  }
}

function summarize(samples: readonly Sample[]) {
  return candidates.flatMap(candidate =>
    scenarios.map(scenario => {
      const selected = samples.filter(sample => sample.candidate === candidate.name && sample.scenario === scenario)
      const durations = selected.map(sample => sample.durationMs).toSorted((left, right) => left - right)
      return {
        candidate: candidate.name,
        scenario,
        samples: selected.length,
        medianMs: durations[Math.floor(durations.length / 2)]!,
        p95Ms: durations[Math.ceil(durations.length * 0.95) - 1]!,
        evaluations: selected.map(sample => sample.evaluations),
        notifications: selected.map(sample => sample.notifications),
      }
    })
  )
}
