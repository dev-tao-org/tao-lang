import { Time, Try, UserInput } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HeadlessBrowser, HttpServer, Path, Platform, Repo } from '@shared/os'
import Exec, { type ChildProcess } from '@shared/os/exec'
import { Http } from '@shared/web'
import * as Workspace from '@workspace'

import { writePreparedTaoApp } from './dev-cli.test-fixtures.TaoApp'

type OptionalTestBrowser = HeadlessBrowser.HeadlessBrowserSession | undefined

Tests.test('public Tao app run renders from its generated Expo session and releases it after shutdown', async () => {
  const root = Artifacts.resolvePath('tmp', 'tao-run-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  await Workspace.initializeProject(root)
  const entry = await writePreparedTaoApp(root)
  const reservation = HttpServer.serve({ port: 0, fetch: () => Http.response() })
  const port = reservation.port
  reservation.stop(true)
  const url = 'http://localhost:' + port
  const child = Exec.spawn(Repo.resolvePath('tao'), [
    'run',
    entry,
    '--session',
    'run-proof',
    '--port',
    String(port),
    '--web',
  ], { cwd: root, addEnv: createTaoRunEnvironment() })
  const output = Promise.all([Exec.readText(child.stdout), Exec.readText(child.stderr)])
  let browser: OptionalTestBrowser
  await Try(async () => {
    await waitForAppServer(url, child)
    browser = await HeadlessBrowser.launch('test TaoRun.test.ts')
    const page = await browser.newPage()
    await page.goto(url)
    await page.getByText('Ready', { exact: true }).waitFor()
    const host = Path.join(root, '.tao/cache/sessions/run-proof/expo')
    Tests.expect(FS.existsSync(Path.join(host, 'package.json'))).toBe(true)
    Tests.expect(FS.existsSync(Path.join(root, '.expo'))).toBe(false)
    child.kill('SIGINT')
    Tests.expect(await child.exited).toBe(0)
    const session = await Workspace.acquireSession(root, { id: 'run-proof' })
    session.release()
    await Tests.expect(Http.request(url)).rejects.toThrow()
  }, {
    async finally() {
      await browser?.close()
      if (child.exitCode === null) {
        child.kill('SIGINT')
      }
      await child.exited
      await FS.writeFile(Path.join(root, 'run.log'), Shared.joinTextLines(...await output))
    },
  })
}, 60_000)

function createTaoRunEnvironment() {
  return { CI: '1', BROWSER: 'none', NODE_ENV: 'development' }
}

async function waitForAppServer(url: string, child: ChildProcess): Promise<void> {
  const deadline = Time.nowMs() + 30_000
  while (Time.nowMs() < deadline && child.exitCode === null) {
    const ready = await Try.WithDefault(false, async () => (await Http.request(url)).ok)
    if (ready) {
      return
    }
    await Time.sleep(50)
  }
  UserInput.fail('The Tao app Expo session did not become ready.')
}
