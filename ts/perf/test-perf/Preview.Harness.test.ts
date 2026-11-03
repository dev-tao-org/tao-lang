import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Browser, FS, Platform, Repo } from '@shared/os'

Tests.test('preview harness bundles with browser-only platform APIs', async () => {
  const directory = Artifacts.resolvePath('tmp', `preview-bundle-${Platform.randomUUID()}`)
  await Try(async () => {
    const build = await Browser.build([Repo.resolvePath('ts/perf/perf-src/preview-browser.ts')], directory)
    Tests.expect(build.logs.map(log => log.message)).toEqual([])
    Tests.expect(build.success).toBe(true)
  }, {
    async finally() {
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
})
