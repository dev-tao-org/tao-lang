import { createRequire } from 'node:module'
import * as FileSystem from './FileSystem'
import * as Repo from './Repo'

export { rejects, throws } from 'node:assert/strict'

/** readApp reads a named Tao fixture from the checkout's Apps/Tests directory. */
export function readApp(name: string): Promise<string> {
  return FileSystem.file(Repo.resolvePath('Apps/Tests', name + '.tao')).text()
}

/** describe groups tests without loading the test runner in ordinary CLI invocations. */
export const describe = testApi('describe')

/** expect exposes test assertions and their matcher helpers. */
export const expect = testApi('expect')

/** test registers a test when invoked by the test runner. */
export const test = testApi('test')

const load = createRequire(import.meta.url)
type TestsModule = typeof import('bun:test')

function testApi<Name extends 'describe' | 'expect' | 'test'>(name: Name): TestsModule[Name] {
  return new Proxy<(...args: unknown[]) => unknown>(function(...args: unknown[]) {
    return Reflect.apply(load('bun:test')[name], undefined, args)
  }, {
    get(_target, property) {
      const api = load('bun:test')[name]
      const value = Reflect.get(api, property, api)
      return typeof value === 'function' ? value.bind(api) : value
    },
  }) as TestsModule[Name]
}
