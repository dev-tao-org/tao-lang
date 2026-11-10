import { createRequire } from '../Bridge_node/Bridge_node'

export type { BuildOutput, BunFile, ServeOptions, Server, SpawnOptions, Subprocess } from 'bun'
/** JavaScriptCore represents the Bun JavaScriptCore module. */
export type JavaScriptCore = typeof import('bun:jsc')
/** BunTestModule represents Bun's lazy test API. */
export type BunTestModule = typeof import('bun:test')

/** getRuntime accesses Bun only when a Bun-backed operation is invoked. */
export function getRuntime(): typeof Bun {
  return Bun
}

/** loadTestApi loads the runner only inside a test invocation. */
export function loadTestApi(): BunTestModule {
  return load('bun:test')
}

/** loadJavaScriptCore loads the heap instrumentation only when measured. */
export function loadJavaScriptCore(): JavaScriptCore {
  return load('bun:jsc')
}

const load = createRequire(import.meta.url)
