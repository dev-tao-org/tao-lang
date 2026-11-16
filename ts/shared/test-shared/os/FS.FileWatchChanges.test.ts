import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { reconcileWatchChanges, watchStamp } from '../../shared-src/os/FS/FileWatchChanges'

Tests.test('watch reconciliation delivers an edit missing from the native notifications', async () => {
  const directory = Artifacts.resolvePath('tmp', `watch-reconciliation-${Platform.randomUUID()}`)
  const file = Path.join(directory, 'Main.tao')
  const changed = Promise.withResolvers<string>()
  const reconciliation = reconcileWatchChanges(changed.resolve)
  await Try(async () => {
    await FS.mkdir(directory)
    await FS.writeFile(file, 'first source')
    const observed = watchStamp(await FS.stat(file))
    await FS.writeFile(file, 'the next, longer source')
    reconciliation.observe(file, observed)
    Tests.expect(await changed.promise).toBe(file)
  }, {
    async finally() {
      reconciliation.dispose()
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
}, 1000)
