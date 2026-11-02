import * as Artifacts from './Artifacts'
import Env from './Env'
import * as FileSystem from './FileSystem'
import { AsyncLocalStorage, createRequire } from './NodeBuiltins'
import type { BunTestModule } from './NodeBuiltins'
import * as Path from './Path'
import * as Platform from './Platform'
import * as Repo from './Repo'

export { rejects, throws } from './NodeBuiltins'

/** readFixture reads an authored fixture at an explicit repository-relative path. */
export function readFixture(path: string): Promise<string> {
  return FileSystem.file(Repo.resolvePath(path)).text()
}

/** describe groups tests without loading the test runner in ordinary CLI invocations. */
export const describe = testApi('describe')

/** expect exposes test assertions and their matcher helpers. */
export const expect = testApi('expect')

/** test registers a test when invoked by the test runner. */
export const test = testApi('test')

type EnvironmentValue = string | undefined
type TestEnvironmentValues = Readonly<Record<string, EnvironmentValue>>
type TestEnvironmentProcess = { readonly env: TestEnvironmentValues }
type EnvironmentScopes = AsyncLocalStorage<TestEnvironmentProcess>
type OptionalEnvironmentScopes = EnvironmentScopes | undefined

/** withEnv scopes environment overrides to a test callback and its asynchronous descendants. */
export function withEnv<Value>(overrides: TestEnvironmentValues, action: () => Value): Value {
  const scopes = resolveEnvironmentScopes()
  const environmentProcess = { env: Env.clone(overrides).values() }
  return scopes.run(environmentProcess, action)
}

const EnvProcessProperty = 'process'
let environmentScopes: OptionalEnvironmentScopes

function resolveEnvironmentScopes(): EnvironmentScopes {
  if (environmentScopes) {
    return environmentScopes
  }
  const scopes = new AsyncLocalStorage<TestEnvironmentProcess>()
  // This test-only seam selects Env backing records without a production override API.
  const originalProcess = Reflect.get(Env, EnvProcessProperty) as TestEnvironmentProcess
  Object.defineProperty(Env, EnvProcessProperty, {
    get: () => scopes.getStore() ?? originalProcess,
  })
  environmentScopes = scopes
  return scopes
}

const load = createRequire(import.meta.url)
type TestsModule = BunTestModule
type TestApiName = 'describe' | 'expect' | 'test'

function testApi<Name extends TestApiName>(name: Name): TestsModule[Name] {
  return new Proxy<(...args: unknown[]) => unknown>(function(...args: unknown[]) {
    return invokeTestApi(name, load('bun:test')[name], undefined, args)
  }, {
    get(_target, property) {
      const api = load('bun:test')[name]
      const value = Reflect.get(api, property, api)
      return typeof value === 'function' ? (...args: unknown[]) => invokeTestApi(name, value, api, args) : value
    },
  }) as TestsModule[Name]
}

function invokeTestApi(name: TestApiName, action: Function, receiver: unknown, args: unknown[]): unknown {
  const scoped = name === 'test' ? args.map(scopeTestCallback) : args
  const result = Reflect.apply(action, receiver, scoped)
  if (name === 'test' && typeof result === 'function') {
    return (...nested: unknown[]) => invokeTestApi(name, result, undefined, nested)
  }
  return result
}

function scopeTestCallback(value: unknown): unknown {
  if (typeof value !== 'function') {
    return value
  }
  const runScopedTest = function(this: unknown, ...args: unknown[]) {
    return withTestStorage(() => Reflect.apply(value, this, args))
  }
  Object.defineProperty(runScopedTest, 'length', { value: value.length })
  return runScopedTest
}

type OptionalTestStorageRoot = string | undefined
let testStorageRoot: OptionalTestStorageRoot

function withTestStorage<Value>(action: () => Value): Value {
  const cache = Env.get('TAO_CACHE_DIR')
  const support = Env.get('TAO_SUPPORT_DIR')
  if (cache && support) {
    return action()
  }
  if (!testStorageRoot) {
    testStorageRoot = Artifacts.resolvePath('tmp/test-storage', Platform.randomUUID())
    Artifacts.trackTemporary(testStorageRoot)
  }
  const overrides = {
    TAO_CACHE_DIR: cache || Path.join(testStorageRoot, 'cache'),
    TAO_SUPPORT_DIR: support || Path.join(testStorageRoot, 'support'),
  }
  return withEnv(overrides, action)
}
