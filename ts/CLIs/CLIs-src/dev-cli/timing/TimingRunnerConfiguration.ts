import { IO } from '@cli-kit'
import { Json, Schema } from '@shared'
import { Errors, NewlineCharacter, Regxs, Try } from '@shared'
import { DevelopmentStorage, FS, Path, Platform } from '@shared/os'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { readTimingRemote } from './TimingRemote'
import { createTimingHelperArguments } from './TimingReport'

/** TimingRunnerConfiguration identifies the saved SSH endpoint and its prepared checkout. */
export type TimingRunnerConfiguration = Schema.infer<typeof runnerSchema>

/** configureTimingRunner verifies a runner over SSH before saving it as the default. */
export async function configureTimingRunner(runner: TimingRunnerConfiguration): Promise<void> {
  requireRunner(runner)
  const remote = { host: runner.host, directory: runner.tooling, controlPath: 'none' }
  const tooling = (await readTimingRemote({ ...remote, args: ['/bin/pwd', '-P'] })).trim()
  const canonical = { host: runner.host, tooling }
  requireRunner(canonical)
  const args = createTimingHelperArguments('help', ['run-snapshot'])
  await readTimingRemote({ ...remote, directory: tooling, args })
  const path = runnerPath()
  await FS.mkdirPrivate(Path.dirname(path))
  const pending = path + '.' + Platform.randomUUID() + '.pending'
  await Try(async () => {
    await FS.writeFile(pending, Json.Print(canonical) + NewlineCharacter, { flag: 'wx', mode: 0o600 })
    await FS.rename(pending, path)
  }, { finally: () => FS.rm(pending, { force: true }) })
  IO.print(`Saved timing runner ${runner.host} in ${path}.`)
}

/** readTimingRunner reads the verified runner configuration shared by local Tao checkouts. */
export async function readTimingRunner(): Promise<TimingRunnerConfiguration> {
  const path = runnerPath()
  if (!await FS.exists(path)) {
    Errors.ThrowUserInput('No timing runner is configured. Run just timing-setup for the agent setup prompt.')
  }
  const runner = Json.Parse(await FS.readFile(path, 'utf8'), { schema: runnerSchema })
  requireRunner(runner)
  return runner
}

const runnerSchema = Schema.object({ host: Schema.string(), tooling: Schema.string() })

function runnerPath(): string {
  return DevelopmentStorage.resolveDirectory('timing', 'runner.json')
}

function requireRunner(runner: TimingRunnerConfiguration): void {
  requireHost(runner.host)
  const { tooling } = runner
  if (!Path.posix.isAbsolute(tooling) || Regxs.RemotePathControlCharacterRegx.test(tooling)) {
    Errors.ThrowUserInput('Use an absolute runner tooling checkout path without control characters.')
  }
  if (tooling.endsWith('/') || Path.posix.normalize(tooling) !== tooling) {
    Errors.ThrowUserInput('Use the canonical runner checkout path, without a trailing slash.')
  }
}
