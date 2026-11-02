import { Errors, Time, Try } from '@shared'
import { Artifacts, Env, FileSystem, HeadlessBrowser, Http, Path, Platform, Repo, Tests } from '@shared/os'

type StarterHost = { child: Platform.ChildProcess; url: string; output: Promise<string[]> }
type OptionalStarterBrowser = Awaited<ReturnType<typeof HeadlessBrowser.launch>> | undefined

Tests.test('library initializer emits a typechecked consumer that renders compiled Tao props', async () => {
  const root = await createStarterDirectory()
  const packageDirectory = Path.join(root, 'src/ts')
  const tao = Repo.resolvePath('tao')
  await Platform.capture(tao, { variadicArgs: ['init', root, '--library'] })
  await linkStarterDependencies(root)
  await Platform.capture(tao, { variadicArgs: ['compile', 'Demo', '--package', packageDirectory], cwd: root })
  await Platform.capture('bun run check', { cwd: packageDirectory })
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
    await FileSystem.writeFile(
      Path.join(root, 'render-receipt.json'),
      JSON.stringify({ status: 'passed', url: host.url }, null, 2),
    )
  }, {
    async finally() {
      await browser?.close()
      if (host.child.exitCode === null) {
        host.child.kill('SIGINT')
      }
      await host.child.exited
      await FileSystem.writeFile(Path.join(root, 'run-proof.log'), (await host.output).join('\n'))
    },
  })
}, 60_000)

async function createStarterDirectory(): Promise<string> {
  const selected = Env.get('TAO_STARTER_PREVIEW')
  const root = selected
    ? Path.resolve(selected)
    : Artifacts.resolvePath('tmp', 'library-starter-' + Platform.randomUUID())
  if (!Path.isWithin(Artifacts.resolvePath(), root)) {
    return Errors.ThrowUserInput('Starter proof output must remain in repository artifacts.')
  }
  if (!selected) {
    Artifacts.trackTemporary(root)
  }
  await FileSystem.mkdir(root)
  return root
}

async function linkStarterDependencies(root: string): Promise<void> {
  const modules = Path.join(root, 'src/ts/node_modules')
  const peers = Repo.resolvePath('Apps/TS Lib App/src/ts/node_modules')
  await FileSystem.mkdir(Path.join(modules, '@example'))
  await FileSystem.symlink(
    Path.join(root, '.tao/cache/libraries/Demo'),
    Path.join(modules, '@example/tao-library'),
    'dir',
  )
  for (const item of await FileSystem.readdir(peers, { withFileTypes: true })) {
    if (item.name !== '@example') {
      await FileSystem.symlink(Path.join(peers, item.name), Path.join(modules, item.name), 'dir')
    }
  }
}

function startStarterHost(root: string): StarterHost {
  const reservation = Http.serve({ port: 0, fetch: () => Http.response() })
  const port = reservation.port
  reservation.stop(true)
  const child = Platform.spawnPiped(Repo.resolvePath('tao'), {
    variadicArgs: [
      'run',
      '--package',
      Path.join(root, 'src/ts'),
      '--web',
      '--port',
      String(port),
      '--session',
      'starter-preview',
    ],
    cwd: root,
    env: createStarterEnvironment(),
  })
  const output = Promise.all([Platform.readText(child.stdout), Platform.readText(child.stderr)])
  return { child, output, url: 'http://localhost:' + port }
}

function createStarterEnvironment() {
  return { ...Env.snapshot(), BROWSER: 'none', CI: '1', NODE_ENV: 'development' }
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
  Errors.ThrowUserInput('Starter host did not become ready.')
}
