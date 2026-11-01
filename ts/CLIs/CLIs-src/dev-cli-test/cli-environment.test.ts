import { S, Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'

const CompletedWarningSummaryRegx = /Completed: [1-9]\d* warning\(s\), 0 error\(s\)/
const SlowTestWarningRegx = /Warning: .*slow-tests\.test\.ts \d+\.\d+ ms/
const LogPathRegx = /Logs: (.+\.log)/
const TypeScriptTestSuccessRegx = /\[TypeScript tests\] passed in \d+\.\d{2}s/
const AllTestsSuccessRegx = /\n\t\u001b\[32mAll tests passed in \d+\.\d{2}s\u001b\[0m\n/

Tests.test('agent test summarizes results and warnings while retaining full output in its log', async () => {
  const environment = { ...Env.snapshot(), TERMINAL_OUTPUT: undefined }
  const child = Platform.spawnPiped(Repo.resolvePath('agent'), {
    variadicArgs: ['test', 'CLIs/CLIs-src/cli-checks-test/slow-tests.test.ts', '--slow', '0', '--parallel', '1'],
    cwd: Repo.getWorkspaceRoot(),
    env: environment,
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  Tests.expect(status).toBe(0)
  const completed = stderr.indexOf('Completed: ')
  Tests.expect(completed).toBeGreaterThanOrEqual(0)
  Tests.expect(stderr.slice(completed)).toMatch(CompletedWarningSummaryRegx)
  Tests.expect(stderr.slice(completed)).toContain('Warning: [TypeScript tests] Slow tests (>0 ms):')
  Tests.expect(stderr.slice(completed)).toMatch(SlowTestWarningRegx)
  Tests.expect(stdout + stderr.slice(0, completed)).not.toContain('a per-run threshold accepts non-negative seconds')
  const logPath = LogPathRegx.exec(stderr)?.[1]
  Tests.expect(logPath).toBeDefined()
  const log = await FileSystem.readFile(Repo.resolvePath(logPath!), 'utf8')
  Tests.expect(log).toContain('bun test --parallel=1')
  Tests.expect(log).toContain('a per-run threshold accepts non-negative seconds')
  Tests.expect(log).toContain('[warn stdout]')
  Tests.expect(stdout + stderr).toMatch(TypeScriptTestSuccessRegx)
  Tests.expect(stdout).toMatch(AllTestsSuccessRegx)
})

Tests.test('fresh setup finds nested extension tools installed after the launcher prepares PATH', async () => {
  await FileSystem.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-environment-'))
  await Try(async () => {
    await FileSystem.mkdir(Path.join(root, '.config'))
    await FileSystem.cp(
      Repo.resolvePath('.config/prepared-environment.sh'),
      Path.join(root, '.config/prepared-environment.sh'),
    )
    await FileSystem.cp(Repo.resolvePath('.config/cli-environment.sh'), Path.join(root, '.config/cli-environment.sh'))
    for (const file of ['devenv.nix', 'devenv.yaml', 'devenv.lock']) {
      await FileSystem.writeFile(Path.join(root, file), '', 'utf8')
    }
    await FileSystem.mkdir(Path.join(root, 'ts/ide-extensions/tao-ide-extension'))
    await FileSystem.writeFile(Path.join(root, 'ts/ide-extensions/tao-ide-extension/package.json'), '{}', 'utf8')
    const tool = Path.join(root, 'fixture-tool')
    await FileSystem.writeFile(tool, '#!/bin/sh\n', 'utf8')
    await FileSystem.chmod(tool, 0o755)
    const path = await Platform.capture('sh', {
      variadicArgs: [
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
      ],
    })
    Tests.expect(path).toBe(Path.join(root, 'ts/ide-extensions/tao-ide-extension/node_modules/.bin/tao-fixture-tool'))
  }, {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('CLI setup reports when Git cannot fingerprint the checkout', async () => {
  await FileSystem.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-environment-failure-'))
  await Try(async () => {
    const repository = Path.join(root, 'repo')
    const bin = Path.join(root, 'bin')
    await FileSystem.mkdirs(Path.join(repository, '.config'), bin)
    await FileSystem.cp(
      Repo.resolvePath('.config/prepared-environment.sh'),
      Path.join(repository, '.config/prepared-environment.sh'),
    )
    await FileSystem.cp(
      Repo.resolvePath('.config/cli-environment.sh'),
      Path.join(repository, '.config/cli-environment.sh'),
    )
    const git = Path.join(bin, 'git')
    await FileSystem.writeFile(git, '#!/bin/sh\necho fixture-git-failure >&2\nexit 1\n', 'utf8')
    await FileSystem.chmod(git, 0o755)
    const environment = {
      ...Env.snapshot(),
      PATH: `${bin}:${Env.get('PATH') ?? ''}`,
      TAO_DEVENV: '1',
      DEVENV_ROOT: repository,
    }
    const child = Platform.spawnPiped('sh', {
      variadicArgs: [
        '-c',
        '. "$1"',
        Path.join(repository, 'agent'),
        Path.join(repository, '.config/cli-environment.sh'),
      ],
      env: environment,
      cwd: repository,
    })
    const [status, stderr] = await Promise.all([child.exited, Platform.readText(child.stderr)])
    Tests.expect(status).toBe(1)
    Tests.expect(stderr).toContain('Tao could not fingerprint this checkout environment.')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('fatal CLI errors remain visible when the configured log path is unwritable', async () => {
  const environment = {
    ...Env.snapshot(),
    OUTPUT_LOG_FILE: 'ts',
    TERMINAL_OUTPUT: '1',
    TERMINAL_UI: '0',
  }
  const child = Platform.spawnPiped(Repo.resolvePath('agent'), {
    variadicArgs: ['unrecognized-command'],
    cwd: Repo.getWorkspaceRoot(),
    env: environment,
  })
  const [status, stderr] = await Promise.all([child.exited, Platform.readText(child.stderr)])
  Tests.expect(status).toBe(1)
  Tests.expect(stderr).toContain('EISDIR')
  Tests.expect(stderr).toContain(Repo.resolvePath('ts'))
})
