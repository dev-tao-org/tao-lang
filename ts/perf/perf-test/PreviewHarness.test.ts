import { Try } from '@shared'
import { Artifacts, Browser, FileSystem, Platform, Repo, Tests } from '@shared/os'

Tests.test('preview harness bundles with browser-only platform APIs', async () => {
  const directory = Artifacts.resolvePath('tmp', `preview-bundle-${Platform.randomUUID()}`)
  await Try(async () => {
    const build = await Browser.build([Repo.resolvePath('ts/perf/perf-src/preview-browser.ts')], directory)
    Tests.expect(build.logs.map(log => log.message)).toEqual([])
    Tests.expect(build.success).toBe(true)
  }, {
    async finally() {
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
})
