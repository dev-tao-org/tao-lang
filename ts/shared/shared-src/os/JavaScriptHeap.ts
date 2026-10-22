import { performance } from 'node:perf_hooks'
import { loadModule } from './Platform'

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
  const startedAt = performance.now()
  Bun.gc(true)
  return performance.now() - startedAt
}

/** collectAndSweep runs a synchronous full JavaScriptCore collection and heap sweep. */
export function collectAndSweep(): Sweep {
  const startedAt = performance.now()
  loadJavaScriptCore().gcAndSweep()
  const durationMs = performance.now() - startedAt
  return { durationMs, snapshot: snapshot() }
}

let javaScriptCore: typeof import('bun:jsc') | undefined

function loadJavaScriptCore(): typeof import('bun:jsc') {
  javaScriptCore ??= loadModule<typeof import('bun:jsc')>('bun:jsc')
  return javaScriptCore
}
