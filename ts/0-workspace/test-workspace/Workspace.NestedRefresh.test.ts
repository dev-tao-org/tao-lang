import * as Runtime from '@runtime'
import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import { createWorkspace } from '../workspace-src/Workspace'

type OptionalExpoSession = Runtime.ExpoSession | undefined
type OptionalBrowser = HeadlessBrowser.Browser | undefined

Tests.test(
  'private child hook state survives owner rerenders and source refresh without leaking captures',
  async () => {
    const root = Artifacts.resolvePath('tmp', `nested-refresh-${Platform.randomUUID()}`)
    const workspace = createWorkspace({
      directory: root,
      outputDirectory: Path.join(root, 'output'),
      runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules') },
    })
    let expo: OptionalExpoSession
    let browser: OptionalBrowser
    await Try(async () => {
      await FS.cp(Repo.resolvePath('Apps/Tests/Language'), root, { recursive: true })
      const path = Path.join(root, 'PrivateViews.tao')
      const source = await FS.readFile(path, 'utf8')
      Tests.expect((await workspace.openFile(Path.join(root, 'Language.tao'))).status).toBe('published')
      expo = await Runtime.start(workspace.runtime!)
      browser = await HeadlessBrowser.launch('test <file.tao>')
      const page = await browser.newPage()
      page.setDefaultTimeout(5000)
      await page.goto(expo.url)
      await page.getByTestId('Left').click()
      await page.getByText('Left: 1', { exact: true }).waitFor()
      const updated = source.replace('"Original"', '"Updated"')
      await FS.writeFile(path, updated)
      Tests.expect((await workspace.openFile(Path.join(root, 'Language.tao'))).status).toBe('published')
      await page.getByText('Updated', { exact: true }).waitFor()
      await page.getByText('Left: 1', { exact: true }).waitFor()
      await page.getByText('Right: 0', { exact: true }).waitFor()
      const edited = updated.replace('{Caption}: {value}', '{Caption}: {value}!')
      Tests.expect(edited).not.toBe(updated)
      await FS.writeFile(path, edited)
      Tests.expect((await workspace.openFile(Path.join(root, 'Language.tao'))).status).toBe('published')
      await page.getByText('Left: 1!', { exact: true }).waitFor()
      await page.getByText('Right: 0!', { exact: true }).waitFor()
    }, {
      async finally() {
        await browser?.close()
        await expo?.dispose()
        await workspace.dispose()
        await FS.rm(root, { recursive: true, force: true })
      },
    })
  },
  60_000,
)
