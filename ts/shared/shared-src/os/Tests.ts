import * as Artifacts from './Artifacts'
import { type BunTestModule, loadTestApi } from './bridges/Bridge_bun/Bridge_bun'
import * as Env from './Env'
import * as FileSystem from './FileSystem'
import * as Platform from './Platform'
import * as Repo from './Repo'

export { rejects, throws } from './bridges/Bridge_node/Bridge_node'

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

type TestsModule = BunTestModule

function testApi<Name extends 'describe' | 'expect' | 'test'>(name: Name): TestsModule[Name] {
  return new Proxy<(...args: unknown[]) => unknown>(function(...args: unknown[]) {
    prepareTestStorage()
    return Reflect.apply(loadTestApi()[name], undefined, args)
  }, {
    get(_target, property) {
      prepareTestStorage()
      const api = loadTestApi()[name]
      const value = Reflect.get(api, property, api)
      return typeof value === 'function' ? value.bind(api) : value
    },
  }) as TestsModule[Name]
}

function prepareTestStorage(): void {
  if (storagePrepared) {
    return
  }
  storagePrepared = true
  if (Env.get('TAO_CACHE_DIR') && Env.get('TAO_SUPPORT_DIR')) {
    return
  }
  const root = Artifacts.resolvePath('tmp/test-storage', Platform.randomUUID())
  Artifacts.trackTemporary(root)
  Env.set('TAO_CACHE_DIR', Env.get('TAO_CACHE_DIR') || `${root}/cache`)
  Env.set('TAO_SUPPORT_DIR', Env.get('TAO_SUPPORT_DIR') || `${root}/support`)
}

let storagePrepared = false
