import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, BuildLock, FS, Path } from '@shared/os'

Tests.test('shared build preparation waits for the current writer and releases ownership', async () => {
  const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'build-lock-'))
  const path = Path.join(directory, 'parser.lock')
  const order: string[] = []
  let release!: () => void
  const pending = new Promise<void>(resolve => release = resolve)
  const first = BuildLock.withBuildLock(path, async () => {
    order.push('first begins')
    await pending
    order.push('first ends')
  })
  const second = BuildLock.withBuildLock(path, async () => {
    order.push('second begins')
  })
  await Try(async () => {
    Tests.expect(order).toEqual(['first begins'])
    release()
    await Promise.all([first, second])
    Tests.expect(order).toEqual(['first begins', 'first ends', 'second begins'])
    Tests.expect(FS.existsSync(path)).toBe(false)
  }, {
    async finally() {
      release()
      await Promise.allSettled([first, second])
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
})
