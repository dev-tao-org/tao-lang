import { Time, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { createWorkspace } from '../workspace-src/Workspace'

const hostUnavailable = Platform.systemInfo().os === 'Darwin' && !await Try(async () => {
  await Platform.requireHostProcessAccess('File notification tests require macOS host access.')
  return true
}, {
  catch() {
    return false
  },
})

Tests.test.skipIf(hostUnavailable)(
  'saved source and external file edits compile through the workspace watcher',
  async () => {
    const directory = Artifacts.resolvePath('tmp', `workspace-watch-${Platform.randomUUID()}`)
    const path = Path.join(directory, 'Hello World.tao')
    const source = await Tests.readApp('Hello World')
    const published: string[] = []
    const workspace = createWorkspace({
      async publish(app) {
        published.push(app.source)
      },
    })
    await Try(async () => {
      await FileSystem.mkdir(directory, { recursive: true })
      await FileSystem.writeFile(path, source)
      Tests.expect((await workspace.openFile(path)).status).toBe('published')
      const edited = source.replace('app ', 'app Saved')
      Tests.expect(edited).not.toBe(source)
      const saved = await workspace.saveSource(current => current.replace('app ', 'app Saved'))
      Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe(edited)
      Tests.expect(saved.status).toBe('published')
      Tests.expect(saved.timings.map(sample => sample.name)).toContain('workspace.read')
      await waitForExternalEdit(workspace, path, source)
      Tests.expect(published).toEqual([source, edited, source])
    }, {
      async finally() {
        workspace.dispose()
        await FileSystem.rm(directory, { recursive: true, force: true })
      },
    })
  },
  10_000,
)

async function waitForExternalEdit(workspace: ReturnType<typeof createWorkspace>, path: string, source: string) {
  let complete!: () => void
  let fail!: (error: unknown) => void
  const published = new Promise<void>((resolve, reject) => {
    complete = resolve
    fail = reject
  })
  const stop = workspace.onPublished(() => complete())
  const cancel = Time.schedule(2000, () => fail('External save was not compiled.'))
  await Try(async () => {
    await FileSystem.writeFile(path, source)
    await published
  }, {
    finally() {
      stop()
      cancel()
    },
  })
}
