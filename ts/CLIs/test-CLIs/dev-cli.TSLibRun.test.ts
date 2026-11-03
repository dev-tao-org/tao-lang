import { ControlCCharacter, Errors, Time, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Http, Path, Platform, Streams, Text } from '@shared/os'
import { Processes } from '@shared/os'
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
        await FS.writeFile(Artifacts.resolvePath('notes/ts-lib-local-terminal.txt'), output)
      },
    })
  },
  60_000,
)

async function startInteractiveRecipe(receive: (chunk: Uint8Array) => void) {
  const directory = await WorkspaceTests.createStandaloneLibraryFixture()
  const reservation = Http.serve({ port: 0, fetch: () => Http.response() })
  const addEnv = {
    BROWSER: 'none',
    CI: undefined,
    NODE_ENV: 'development',
    TERM: 'xterm-256color',
    RCT_METRO_PORT: String(reservation.port),
  }
  reservation.stop(true)
  const child = Processes.spawnPiped('just run', {
    cwd: directory,
    addEnv,
    terminal: { cols: 80, rows: 28, data: (_terminal, chunk) => receive(chunk) },
  })
  return { child, directory, url: 'http://localhost:' + addEnv.RCT_METRO_PORT }
}

async function waitForReady(read: () => string): Promise<void> {
  const deadline = Time.nowMs() + 45_000
  while (Time.nowMs() < deadline) {
    if (read().includes('show all commands') && read().includes('Ctrl+C')) {
      return
    }
    await Time.sleep(25)
  }
  Errors.ThrowUserInput('Interactive Expo did not become ready:\n' + read())
}

async function waitForCommands(read: () => string): Promise<void> {
  const deadline = Time.nowMs() + 5000
  while (Time.nowMs() < deadline) {
    if (read().includes('open web')) {
      return
    }
    await Time.sleep(25)
  }
  Errors.ThrowUserInput('Expo did not show its web shortcut:\n' + read())
}
