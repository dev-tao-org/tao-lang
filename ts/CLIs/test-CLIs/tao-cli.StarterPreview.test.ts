import { Json, UserInput } from '@shared'
import { Time, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Env, FS, HeadlessBrowser, HttpServer, Path, Platform, Repo } from '@shared/os'
import Exec, { type ChildProcess } from '@shared/os/exec'
import { Http } from '@shared/web'
import * as WorkspaceTests from '@workspace-tests'

type StarterHost = { child: ChildProcess; url: string; output: Promise<string[]> }
type OptionalStarterBrowser = HeadlessBrowser.HeadlessBrowserSession | undefined

Tests.test('library initializer emits a typechecked consumer that renders compiled Tao props', async () => {
  const root = await createStarterDirectory()
  const packageDirectory = Path.join(root, 'src/ts')
  const tao = Repo.resolvePath('tao')
  await Exec.captureStdout(tao, ['init', root, '--library'])
  await WorkspaceTests.linkStandaloneLibraryDependencies(root)
  await Exec.captureStdout(tao, ['compile', 'Demo', '--package', packageDirectory], { cwd: root })
  await Exec.captureStdout('bun', 'run check', { cwd: packageDirectory })
  const host = startStarterHost(root)
  let browser: OptionalStarterBrowser
  await Try(async () => {
    await waitForStarterHost(host)
    browser = await HeadlessBrowser.launch('test StarterPreview.test.ts')
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(host.url)
    await page.getByText('Tao library consumer', { exact: true }).waitFor()
    await page.getByText('Ada', { exact: true }).waitFor()
    Tests.expect(errors).toEqual([])
    await page.screenshot({ path: Path.join(root, 'rendered.png') })
    await FS.writeFile(
      Path.join(root, 'render-receipt.json'),
      Json.Print({ status: 'passed', url: host.url }),
    )
  }, {
    async finally() {
      await browser?.close()
      if (host.child.exitCode === null) {
        host.child.kill('SIGINT')
      }
      await host.child.exited
      await FS.writeFile(Path.join(root, 'run-proof.log'), Shared.joinTextLines(...await host.output))
    },
  })
}, 60_000)

async function createStarterDirectory(): Promise<string> {
  const selected = Env.get('TAO_STARTER_PREVIEW')
  const root = selected
    ? Path.resolve(selected)
    : Artifacts.resolvePath('tmp', 'library-starter-' + Platform.randomUUID())
  if (!Path.isWithin(Artifacts.resolvePath(), root)) {
    return UserInput.fail('Starter proof output must remain in repository artifacts.')
  }
  if (!selected) {
    Artifacts.trackTemporary(root)
  }
  await FS.mkdir(root)
  return root
}

function startStarterHost(root: string): StarterHost {
  const reservation = HttpServer.serve({ port: 0, fetch: () => Http.response() })
  const port = reservation.port
  reservation.stop(true)
  const child = Exec.spawn(Repo.resolvePath('tao'), [
    'run',
    '--package',
    Path.join(root, 'src/ts'),
    '--web',
    '--port',
    String(port),
    '--session',
    'starter-preview',
  ], { cwd: root, addEnv: createStarterEnvironment() })
  const output = Promise.all([Exec.readText(child.stdout), Exec.readText(child.stderr)])
  return { child, output, url: 'http://localhost:' + port }
}

function createStarterEnvironment() {
  return { BROWSER: 'none', CI: '1', NODE_ENV: 'development' }
}

async function waitForStarterHost(host: StarterHost): Promise<void> {
  const deadline = Time.nowMs() + 30_000
  while (Time.nowMs() < deadline && host.child.exitCode === null) {
    const ready = await Try.WithDefault(false, async () => (await Http.request(host.url)).ok)
    if (ready) {
      return
    }
    await Time.sleep(50)
  }
  UserInput.fail('Starter host did not become ready.')
}
