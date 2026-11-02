import { Errors, joinTextLines, Time, Try } from '@shared'
import { Artifacts, FileSystem, HeadlessBrowser, Http, Path, Platform, Repo, Tests } from '@shared/os'
import { initializeProject } from '@workspace/projects/Projects'
import { acquireSession } from '@workspace/projects/Sessions'
import { writePreparedTaoApp } from './TaoAppFixture'

type OptionalTestBrowser = HeadlessBrowser.HeadlessBrowserSession | undefined

Tests.test('public Tao app run renders from its generated Expo session and releases it after shutdown', async () => {
  const root = Artifacts.resolvePath('tmp', 'tao-run-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  await initializeProject(root)
  const entry = await writePreparedTaoApp(root)
  const reservation = Http.serve({ port: 0, fetch: () => Http.response() })
  const port = reservation.port
  reservation.stop(true)
  const url = 'http://localhost:' + port
  const child = Platform.spawnPiped(Repo.resolvePath('tao'), {
    variadicArgs: ['run', entry, '--session', 'run-proof', '--port', String(port), '--web'],
    cwd: root,
    addEnv: createTaoRunEnvironment(),
  })
  const output = Promise.all([Platform.readText(child.stdout), Platform.readText(child.stderr)])
  let browser: OptionalTestBrowser
  await Try(async () => {
    await waitForAppServer(url, child)
    browser = await HeadlessBrowser.launch('test TaoRun.test.ts')
    const page = await browser.newPage()
    await page.goto(url)
    await page.getByText('Ready', { exact: true }).waitFor()
    const host = Path.join(root, '.tao/cache/sessions/run-proof/expo')
    Tests.expect(FileSystem.existsSync(Path.join(host, 'package.json'))).toBe(true)
    Tests.expect(FileSystem.existsSync(Path.join(root, '.expo'))).toBe(false)
    child.kill('SIGINT')
    Tests.expect(await child.exited).toBe(0)
    const session = await acquireSession(root, { id: 'run-proof' })
    session.release()
    await Tests.expect(Http.request(url)).rejects.toThrow()
  }, {
    async finally() {
      await browser?.close()
      if (child.exitCode === null) {
        child.kill('SIGINT')
      }
      await child.exited
      await FileSystem.writeFile(Path.join(root, 'run.log'), joinTextLines(...await output))
    },
  })
}, 60_000)

function createTaoRunEnvironment() {
  return { CI: '1', BROWSER: 'none', NODE_ENV: 'development' }
}

async function waitForAppServer(url: string, child: Platform.ChildProcess): Promise<void> {
  const deadline = Time.nowMs() + 30_000
  while (Time.nowMs() < deadline && child.exitCode === null) {
    const ready = await Try.WithDefault(false, async () => (await Http.request(url)).ok)
    if (ready) {
      return
    }
    await Time.sleep(50)
  }
  Errors.ThrowUserInput('The Tao app Expo session did not become ready.')
}
