import { Json } from '@shared'
import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import { prepareRuntime } from '../CLIs-src/cli-checks/runtime-build'
import { readRuntimeSources } from '../CLIs-src/cli-checks/runtime-sources'

Tests.test('runtime source directories include production additions and exclude tests', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-source-folders-${Platform.randomUUID()}`)
  await Try(async () => {
    const client = Path.join(root, 'client')
    await FS.mkdir(Path.join(client, 'helper-test'))
    await FS.writeFile(Path.join(client, 'Helper.ts'), 'export {}')
    await FS.writeFile(Path.join(client, 'Helper.test.ts'), 'export {}')
    await FS.writeFile(Path.join(client, 'helper-test/Hidden.ts'), 'export {}')
    const fixture = await readRuntimeSources({ runtime: client }, {})
    Tests.expect(Object.keys(fixture)).toEqual(['runtime/Helper.ts'])

    const sources = await readRuntimeSources()
    Tests.expect(sources['runtime/TR.ts']).toBe(Repo.resolvePath('ts/7-runtime/runtime-src/client/TR.ts'))
    Tests.expect(sources['shared/universal/universal.ts']).toBeDefined()
    Tests.expect(sources['shared/os/preview/PreviewPlatform.ts']).toBeDefined()
    Tests.expect(sources['runtime/Runtime.ts']).toBeUndefined()
    Tests.expect(sources['shared/os/Platform.ts']).toBeUndefined()
    Tests.expect(sources['runtime/Bridge_react/jsx-runtime.ts']).toBeDefined()
    Tests.expect(sources['runtime/Bridge_expo.ts']).toBeDefined()
    Tests.expect(sources['shared/os/bridges/Bridge_browser/Bridge_browser.ts']).toBeDefined()
    Tests.expect(Object.values(sources).some(path => path.includes('/Bridge_bun/'))).toBe(false)
    Tests.expect(Object.values(sources).some(path => path.includes('/Bridge_expo-host'))).toBe(false)

    const resources = await prepareRuntime()
    const metadata = Json.Parse(await FS.readFile(Path.join(resources, 'runtime.json'), 'utf8')) as {
      sourceFiles: string[]
    }
    Tests.expect(metadata.sourceFiles).toContain('runtime/TR.ts')
    Tests.expect(metadata.sourceFiles).toContain('shared/shared.ts')
    Tests.expect(await FS.exists(Path.join(resources, 'runtime/Runtime.ts'))).toBe(false)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})
