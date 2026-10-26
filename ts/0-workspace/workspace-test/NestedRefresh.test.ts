import * as Runtime from '@runtime/Runtime'
import { Try } from '@shared'
import { Artifacts, FileSystem, HeadlessBrowser, Path, Platform, Repo, Tests } from '@shared/os'
import { createWorkspace, Document } from '../workspace-src/Workspace'

Tests.test(
  'private child hook state survives owner rerenders and source refresh without leaking captures',
  async () => {
    const root = Artifacts.resolvePath('tmp', `nested-refresh-${Platform.randomUUID()}`)
    const workspace = createWorkspace({
      directory: root,
      outputDirectory: Path.join(root, 'output'),
      runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules') },
    })
    let expo: Runtime.ExpoSession | undefined
    let browser: HeadlessBrowser.Browser | undefined
    await Try(async () => {
      await FileSystem.mkdir(root, { recursive: true })
      const source = await Tests.readApp('Nested Views')
      const path = Path.join(root, 'Nested.tao')
      Tests.expect((await workspace.update(new Document(path, source))).status).toBe('published')
      expo = await Runtime.start(workspace.runtime!)
      browser = await HeadlessBrowser.launch('test <file.tao>')
      const page = await browser.newPage()
      page.setDefaultTimeout(5000)
      await page.goto(expo.url)
      await page.getByTestId('Left').click()
      await page.getByText('Left: 1', { exact: true }).waitFor()
      const updated = source.replace('"Original"', '"Updated"')
      Tests.expect((await workspace.update(new Document(path, updated))).status).toBe('published')
      await page.getByText('Updated', { exact: true }).waitFor()
      await page.getByText('Left: 1', { exact: true }).waitFor()
      await page.getByText('Right: 0', { exact: true }).waitFor()
      const edited = updated.replace('{Caption}: {value}', '{Caption}: {value}!')
      Tests.expect(edited).not.toBe(updated)
      Tests.expect((await workspace.update(new Document(path, edited))).status).toBe('published')
      await page.getByText('Left: 1!', { exact: true }).waitFor()
      await page.getByText('Right: 0!', { exact: true }).waitFor()
    }, {
      async finally() {
        await browser?.close()
        await expo?.dispose()
        await workspace.dispose()
        await FileSystem.rm(root, { recursive: true, force: true })
      },
    })
  },
  60_000,
)
