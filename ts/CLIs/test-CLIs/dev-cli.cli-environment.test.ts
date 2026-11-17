import { NewlineCharacter, S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Env, FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

const TimingReportPathRegx = /Full timings: (\S+\.xml)/
const SlowTestWarningRegx = /Warning: .*\d+ tests exceeded 0 ms; slowest \d+\.\d+ ms\./
const LogPathRegx = /Logs: (.+\.log)/
const TypeScriptTestSuccessRegx = /\[TypeScript tests\] passed in \d+\.\d{2}s/
const AllTestsSuccessRegx = /\n\t\u001b\[32mAll tests passed in \d+\.\d{2}s\u001b\[0m\n/
const GitFingerprintFailureScript = Shared.joinTextLines(
  S`
    #!/bin/sh
    echo fixture-git-failure >&2
    exit 1
  `,
  '',
)

Tests.test('the developer launcher offers its command list and explains interactive app startup', async () => {
  const command = Repo.resolvePath('dev')
  const cwd = Repo.getWorkspaceRoot()
  const help = await Exec.captureStdout(command, 'help', { cwd })
  Tests.expect(help).toContain('Commands:')
  Tests.expect(help).toContain('performance')
  Tests.expect(help).toContain('timing-compare')
  Tests.expect(help).toContain('verify')
  const noArguments = await Exec.captureStdout(command, { cwd })
  Tests.expect(noArguments).toContain('Run ./dev in an interactive terminal')
})

Tests.test('agent test summarizes results and warnings while retaining full output in its log', async () => {
  const addEnv = { TERMINAL_OUTPUT: undefined }
  const child = Exec.spawn(Repo.resolvePath('agent'), [
    'test',
    'CLIs/test-CLIs/cli-checks.slow-tests.test.ts',
    '--slow',
    '0',
    '--parallel',
    '1',
  ], { cwd: Repo.getWorkspaceRoot(), addEnv })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Exec.readText(child.stdout),
    Exec.readText(child.stderr),
  ])
  Tests.expect(status).toBe(0)
  const completed = stderr.indexOf('Completed: ')
  Tests.expect(completed).toBeGreaterThanOrEqual(0)
  Tests.expect(stderr.slice(completed)).toContain('Completed: 1 warning(s), 0 error(s).')
  Tests.expect(stderr.slice(completed)).toMatch(SlowTestWarningRegx)
  Tests.expect(stdout + stderr.slice(0, completed)).not.toContain('a per-run threshold accepts non-negative seconds')
  const logPath = LogPathRegx.exec(stderr)?.[1]
  Tests.expect(logPath).toBeDefined()
  const log = await FS.readFile(Repo.resolvePath(logPath!), 'utf8')
  Tests.expect(log).toContain('bun test --parallel=1')
  Tests.expect(log).toContain('a per-run threshold accepts non-negative seconds')
  Tests.expect(log).toContain('[warn stdout]')
  const reportPath = TimingReportPathRegx.exec(log)?.[1]
  Tests.expect(reportPath).toBeDefined()
  const report = await FS.readFile(Repo.resolvePath(reportPath!), 'utf8')
  Tests.expect(report).toContain('a per-run threshold accepts non-negative seconds')
  Tests.expect(report).toContain('time=')
  Tests.expect(report).toContain('</testsuites>')
  Tests.expect(stdout + stderr).toMatch(TypeScriptTestSuccessRegx)
  Tests.expect(stdout).toMatch(AllTestsSuccessRegx)
})

Tests.test('fresh setup finds nested extension tools installed after the launcher prepares PATH', async () => {
  await FS.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-environment-'))
  await Try(async () => {
    await FS.mkdir(Path.join(root, '.config'))
    await FS.cp(
      Repo.resolvePath('.config/prepared-environment.sh'),
      Path.join(root, '.config/prepared-environment.sh'),
    )
    await FS.cp(Repo.resolvePath('.config/cli-environment.sh'), Path.join(root, '.config/cli-environment.sh'))
    for (const file of ['devenv.nix', 'devenv.yaml', 'devenv.lock']) {
      await FS.writeFile(Path.join(root, file), '', 'utf8')
    }
    await FS.mkdir(Path.join(root, 'ts/ide-extensions/tao-ide-extension'))
    await FS.writeFile(Path.join(root, 'ts/ide-extensions/tao-ide-extension/package.json'), '{}', 'utf8')
    const tool = Path.join(root, 'fixture-tool')
    await FS.writeFile(tool, '#!/bin/sh' + NewlineCharacter, 'utf8')
    await FS.chmod(tool, 0o755)
    const path = await Exec.captureStdout('sh', [
      '-c',
      S`
        DEVENV_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
        export DEVENV_ROOT TAO_DEVENV=1
        . "$1"
        mkdir -p "$repository/ts/ide-extensions/tao-ide-extension/node_modules/.bin"
        cp "$2" "$repository/ts/ide-extensions/tao-ide-extension/node_modules/.bin/tao-fixture-tool"
        command -v tao-fixture-tool
      `,
      Path.join(root, 'agent'),
      Repo.resolvePath('.config/cli-environment.sh'),
      tool,
    ])
    Tests.expect(path).toBe(Path.join(root, 'ts/ide-extensions/tao-ide-extension/node_modules/.bin/tao-fixture-tool'))
  }, {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('CLI setup reports when Git cannot fingerprint the checkout', async () => {
  await FS.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-environment-failure-'))
  await Try(async () => {
    const repository = Path.join(root, 'repo')
    const bin = Path.join(root, 'bin')
    await FS.mkdirs(Path.join(repository, '.config'), bin)
    await FS.cp(
      Repo.resolvePath('.config/prepared-environment.sh'),
      Path.join(repository, '.config/prepared-environment.sh'),
    )
    await FS.cp(
      Repo.resolvePath('.config/cli-environment.sh'),
      Path.join(repository, '.config/cli-environment.sh'),
    )
    const git = Path.join(bin, 'git')
    await FS.writeFile(
      git,
      GitFingerprintFailureScript,
      'utf8',
    )
    await FS.chmod(git, 0o755)
    const addEnv = {
      PATH: `${bin}:${Env.get('PATH') ?? ''}`,
      TAO_DEVENV: '1',
      DEVENV_ROOT: repository,
    }
    const child = Exec.spawn('sh', [
      '-c',
      '. "$1"',
      Path.join(repository, 'agent'),
      Path.join(repository, '.config/cli-environment.sh'),
    ], { addEnv, cwd: repository })
    const [status, stderr] = await Promise.all([child.exited, Exec.readText(child.stderr)])
    Tests.expect(status).toBe(1)
    Tests.expect(stderr).toContain('Tao could not fingerprint this checkout environment.')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('fatal CLI errors remain visible when the configured log path is unwritable', async () => {
  const addEnv = {
    OUTPUT_LOG_FILE: 'ts',
    TERMINAL_OUTPUT: '1',
    TERMINAL_UI: '0',
  }
  const child = Exec.spawn(Repo.resolvePath('agent'), ['unrecognized-command'], {
    cwd: Repo.getWorkspaceRoot(),
    addEnv,
  })
  const [status, stderr] = await Promise.all([child.exited, Exec.readText(child.stderr)])
  Tests.expect(status).toBe(1)
  Tests.expect(stderr).toContain('EISDIR')
  Tests.expect(stderr).toContain(Repo.resolvePath('ts'))
})
