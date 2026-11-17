import { ControlCCharacter, Time, Try, UserInput } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HttpServer, Path, Platform, Streams, Text } from '@shared/os'
import Exec from '@shared/os/exec'
import { Http } from '@shared/web'
import * as WorkspaceTests from '@workspace-tests'

Tests.test.skipIf(Platform.systemInfo().os === 'Windows_NT')(
  'local TS-Lib run shows the Expo URL and shortcuts in an interactive terminal',
  async () => {
    let output = ''
    const decode = Streams.createDecoder()
    const { child, url, directory } = await startInteractiveRecipe(chunk => output += decode(chunk))
    await Try(async () => {
      await waitForReady(() => Text.stripAnsi(output))
      child.terminal!.write('?')
      await waitForCommands(() => Text.stripAnsi(output))
      const rendered = Text.stripAnsi(output)
      Tests.expect(rendered).toContain('open web')
      Tests.expect(rendered).toContain('Ctrl+C')
      Tests.expect(rendered).toContain(url)
      Tests.expect(rendered).toContain(Path.join(directory, '.tao/cache/sessions/.cli/expo'))
      Tests.expect((await Http.request(url)).status).toBe(200)
      child.terminal!.write(ControlCCharacter)
      Tests.expect(await child.exited).toBe(0)
      await Tests.expect(Http.request(url)).rejects.toThrow()
    }, {
      async finally() {
        child.terminal!.write(ControlCCharacter)
        await child.exited
        child.terminal!.close()
        await FS.mkdir(Artifacts.resolvePath('notes'))
        await FS.writeFile(Artifacts.resolvePath('notes/ts-lib-local-terminal.txt'), output)
      },
    })
  },
  60_000,
)

async function startInteractiveRecipe(receive: (chunk: Uint8Array) => void) {
  const directory = await WorkspaceTests.createStandaloneLibraryFixture()
  const reservation = HttpServer.serve({ port: 0, fetch: () => Http.response() })
  const addEnv = {
    BROWSER: 'none',
    CI: undefined,
    NODE_ENV: 'development',
    TERM: 'xterm-256color',
    RCT_METRO_PORT: String(reservation.port),
  }
  reservation.stop(true)
  const child = Exec.spawn('just', 'run', {
    cwd: directory,
    addEnv,
    terminal: { cols: 80, rows: 28, data: (_terminal, chunk) => receive(chunk) },
  })
  return { child, directory, url: 'http://localhost:' + addEnv.RCT_METRO_PORT }
}

async function waitForReady(read: () => string): Promise<void> {
  const ready = await Time.waitFor(success => {
    const output = read()
    return output.includes('show all commands') && output.includes('Ctrl+C') ? success(true) : undefined
  }, { timeout: 45_000 })
  if (ready === undefined) {
    UserInput.fail('Interactive Expo did not become ready:\n' + read())
  }
}

async function waitForCommands(read: () => string): Promise<void> {
  const ready = await Time.waitFor(success => read().includes('open web') ? success(true) : undefined, {
    timeout: 5000,
  })
  if (ready === undefined) {
    UserInput.fail('Expo did not show its web shortcut:\n' + read())
  }
}
