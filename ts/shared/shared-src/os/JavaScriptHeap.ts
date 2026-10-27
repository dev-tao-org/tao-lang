import * as Time from '../universal/Time'
import * as BunHost from './bridges/Bridge_bun/Bridge_bun'
import type { JavaScriptCore } from './bridges/Bridge_bun/Bridge_bun'

/** Snapshot records JavaScriptCore heap bytes and surviving allocation cells. */
export type Snapshot = { heapBytes: number; liveCells: number }

/** Sweep records a full collection and the time required to reclaim unreachable cells. */
export type Sweep = { durationMs: number; snapshot: Snapshot }

/** snapshot reads live JavaScriptCore heap statistics after a collection. */
export function snapshot(): Snapshot {
  const stats = loadJavaScriptCore().heapStats()
  return { heapBytes: stats.heapSize, liveCells: stats.objectCount }
}

/** forceCollection runs Bun's forced collection and returns its elapsed duration. */
export function forceCollection(): number {
  const startedAt = Time.nowMs()
  BunHost.getRuntime().gc(true)
  return Time.nowMs() - startedAt
}

/** collectAndSweep runs a synchronous full JavaScriptCore collection and heap sweep. */
export function collectAndSweep(): Sweep {
  const startedAt = Time.nowMs()
  loadJavaScriptCore().gcAndSweep()
  const durationMs = Time.nowMs() - startedAt
  return { durationMs, snapshot: snapshot() }
}

let javaScriptCore: JavaScriptCore | undefined

function loadJavaScriptCore(): JavaScriptCore {
  javaScriptCore ??= BunHost.loadJavaScriptCore()
  return javaScriptCore
}
