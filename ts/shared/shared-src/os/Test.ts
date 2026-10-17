import { createRequire } from 'node:module'

const load = createRequire(import.meta.url)
type TestModule = typeof import('bun:test')

/** describe groups tests without loading the test runner in ordinary CLI invocations. */
export const describe = testApi('describe')

/** expect exposes test assertions and their matcher helpers. */
export const expect = testApi('expect')

/** test registers a test when invoked by the test runner. */
export const test = testApi('test')

function testApi<Name extends 'describe' | 'expect' | 'test'>(name: Name): TestModule[Name] {
  return new Proxy<(...args: unknown[]) => unknown>(function(...args: unknown[]) {
    return Reflect.apply(load('bun:test')[name], undefined, args)
  }, {
    get(_target, property) {
      return Reflect.get(load('bun:test')[name], property)
    },
  }) as TestModule[Name]
}

export { rejects, throws } from 'node:assert/strict'
