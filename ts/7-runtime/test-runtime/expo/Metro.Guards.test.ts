import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import * as Runtime from '../../runtime-src/Runtime'

Tests.test('Metro refuses unsupported dependency versions and out-of-process worker configuration', async () => {
  await verifyRejectedMode('version', 'Unsupported underlying Metro version')
  await verifyRejectedMode('workers', 'require one in-process worker')
}, 60_000)

type RejectedMetroMode = 'version' | 'workers'
async function verifyRejectedMode(mode: RejectedMetroMode, expected: string): Promise<void> {
  const directory = Artifacts.resolvePath('tmp/metro-guard', Platform.randomUUID())
  await Try(async () => {
    const application = await Runtime.create({
      directory,
      dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
    })
    const preload = Path.join(directory, 'guard.cjs')
    const source = mode === 'version'
      ? versionPreload(application.metroPreloadPath!)
      : workerPreload(application.metroPreloadPath!)
    await FS.writeFile(preload, source)
    application.metroPreloadPath = preload
    application.generated = {
      revision: 'A',
      sequence: 0,
      files: { 'App.tsx': 'export default function App() { return null; }' },
    }
    await Tests.expect(Runtime.start(application)).rejects.toThrow(expected)
  }, {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
}

function versionPreload(production: string): string {
  return S`
    const Module = require('node:module');
    const load = Module._load;
    Module._load = function(name, ...args) {
      return name === 'metro/package.json' ? { version: '999.0.0' } : load.call(this, name, ...args);
    };
    module.exports = require(${Json.Print(production)});
  `
}

function workerPreload(production: string): string {
  return S`
    const production = require(${Json.Print(production)});
    exports.enhanceMiddleware = (middleware, metro) => {
      metro._config.maxWorkers = 2;
      return production.enhanceMiddleware(middleware, metro);
    };
  `
}
