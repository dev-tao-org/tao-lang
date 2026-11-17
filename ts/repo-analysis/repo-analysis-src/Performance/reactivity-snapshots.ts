import * as Client from '@runtime/client'
import { Errors, Switch, Time, Try } from '@shared'
import { type ReactivitySummary, summarizeReactivity } from './ReactivitySummary'

/** ReactiveSnapshotMeasurements retains raw publication timings and work counts with their summaries. */
export type ReactiveSnapshotMeasurements = { samples: SnapshotSample[]; summary: ReactivitySummary[] }

/** measureReactiveSnapshots measures collection publication and downstream work through the public engine. */
export function measureReactiveSnapshots(): ReactiveSnapshotMeasurements {
  const samples: SnapshotSample[] = []
  for (let pass = -2; pass < 7; pass += 1) {
    const ordered = pass % 2 === 0 ? Scenarios : Scenarios.toReversed()
    for (const scenario of ordered) {
      const sample = measureSnapshotScenario(scenario)
      if (pass >= 0) {
        samples.push(sample)
      }
    }
  }
  return { samples, summary: Scenarios.map(scenario => summarizeSnapshots(samples, scenario)) }
}

type SnapshotScenario = 'reused-snapshot' | 'fresh-equal-list' | 'shared-field-update' | 'fresh-field-update'
type SnapshotRow = { id: number; value: number }
type SnapshotSample = {
  scenario: SnapshotScenario
  durationMs: number
  evaluations: number
  notifications: number
  operations: number
  rows: number
}
const RowCount = 1000
const OperationCount = 1000
const Scenarios: readonly SnapshotScenario[] = [
  'reused-snapshot',
  'fresh-equal-list',
  'shared-field-update',
  'fresh-field-update',
]

function measureSnapshotScenario(scenario: SnapshotScenario): SnapshotSample {
  const engine = Client.createReactiveEngine()
  return Try(() => measureSnapshotWrites(engine, scenario), { finally: () => engine.dispose() })
}

function measureSnapshotWrites(engine: Client.ReactiveEngine, scenario: SnapshotScenario): SnapshotSample {
  const source = engine.createWritable(createRows(0))
  let evaluations = 0
  let notifications = 0
  const result = engine.createComputed(() => {
    evaluations += 1
    return source.jsValue()[0]!.value
  })
  result.observe(() => notifications += 1)
  const original = source.jsValue()
  const makeRows = selectRowFactory(scenario, original)
  evaluations = 0
  notifications = 0
  const startedAt = Time.nowMs()
  for (let index = 1; index <= OperationCount; index += 1) {
    source.update(makeRows(index))
  }
  const durationMs = Time.nowMs() - startedAt
  requireSnapshotResult(scenario, result.jsValue(), evaluations, notifications, source.jsValue() === original)
  return { scenario, durationMs, evaluations, notifications, operations: OperationCount, rows: RowCount }
}

function selectRowFactory(scenario: SnapshotScenario, original: readonly SnapshotRow[]) {
  return Switch<SnapshotScenario, (index: number) => readonly SnapshotRow[]>(scenario, {
    'reused-snapshot': () => () => original,
    'fresh-equal-list': () => () => createRows(0),
    'shared-field-update': () => index => [{ id: 0, value: index }, ...original.slice(1)],
    'fresh-field-update': () => index => createRows(index),
  })
}

function createRows(value: number): SnapshotRow[] {
  return Array.from({ length: RowCount }, (_, id) => ({ id, value: id === 0 ? value : 0 }))
}

function requireSnapshotResult(
  scenario: SnapshotScenario,
  value: number,
  evaluations: number,
  notifications: number,
  retained: boolean,
): void {
  const unchanged = scenario === 'reused-snapshot' || scenario === 'fresh-equal-list'
  const expected = unchanged ? 0 : OperationCount
  const correctWork = evaluations === expected && notifications === expected
  if (value !== expected || !correctWork || retained !== unchanged) {
    Errors.ThrowShouldNeverHappen('Snapshot benchmark lost value, equality, or downstream propagation semantics.')
  }
}

function summarizeSnapshots(samples: readonly SnapshotSample[], scenario: SnapshotScenario) {
  const selected = samples.filter(sample => sample.scenario === scenario)
  return summarizeReactivity('snapshots/1000-rows', scenario, selected)
}
