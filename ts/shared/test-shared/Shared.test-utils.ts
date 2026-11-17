import { type BunTestModule, loadTestApi } from '../shared-src/os/bridges/Bridge_bun/Bridge_bun'
import { AsyncLocalStorage } from '../shared-src/os/bridges/Bridge_node/Bridge_node'
import Env from '../shared-src/os/Env'
import * as FS from '../shared-src/os/FS'
import * as Path from '../shared-src/os/Path'
import * as Platform from '../shared-src/os/Platform'
import * as Repo from '../shared-src/os/Repo'
import * as Artifacts from '../shared-src/os/Storage/Artifacts'

export { rejects, throws } from '../shared-src/os/bridges/Bridge_node/Bridge_node'

/** readFixture reads an authored fixture at an explicit repository-relative path. */
export function readFixture(path: string): Promise<string> {
  return FS.file(Repo.resolvePath(path)).text()
}

/** describe groups tests without loading the test runner in ordinary CLI invocations. */
export const describe = testApi('describe')

/** expect exposes test assertions and their matcher helpers. */
export const expect = testApi('expect')

/** mock exposes Bun's test mocking API for isolated failure probes. */
export const mock = testApi('mock')

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

type TestsModule = BunTestModule
type TestApiName = 'describe' | 'expect' | 'mock' | 'test'

function testApi<Name extends TestApiName>(name: Name): TestsModule[Name] {
  return new Proxy<(...args: unknown[]) => unknown>(function(...args: unknown[]) {
    return invokeTestApi(name, loadTestApi()[name], undefined, args)
  }, {
    get(_target, property) {
      const api = loadTestApi()[name]
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
  FS.mkdirSync(Artifacts.resolvePath('tmp'), { recursive: true })
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
