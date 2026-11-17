import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Env, FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

Tests.test('CLI launchers prepare generated files before loading commands when needed', async () => {
  await FS.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-generated-bootstrap-'))
  await Try(async () => {
    await createLauncherFixture(root)
    await assertMissingAstPreparesWithoutSetup(root)
    await assertExplicitSetupBypassesPreflight(root)
    await assertMissingDependenciesRequireSetup(root)
    await assertPreparationFailureStopsLauncher(root)
    await assertExistingAstSkipsSetup(root)
    await assertVerifyChecksExistingAst(root)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

type LauncherResult = { status: number; stdout: string; stderr: string }

async function createLauncherFixture(root: string): Promise<void> {
  const bin = Path.join(root, 'bin')
  await FS.mkdirs(Path.join(root, '.config'), bin, Path.join(root, 'ts/2-ast-gen/_gen_AST'))
  for (const launcher of ['agent', 'dev', 'tao']) {
    await FS.cp(Repo.resolvePath(launcher), Path.join(root, launcher))
  }
  for (const config of ['cli-environment.sh', 'prepared-environment.sh', 'ensure-cli-generated.sh']) {
    await FS.cp(Repo.resolvePath(`.config/${config}`), Path.join(root, '.config', config))
  }
  await writeFixtureCommand(
    bin,
    'git',
    Shared.joinTextLines(
      S`
        #!/bin/sh
        printf fixture-hash\\n
      `,
      '',
    ),
  )
  await writeFixtureCommand(bin, 'bun', fakeBunScript())
  const hostProbe = S`
    #!/bin/sh
    test "$*" = '-axo pid=,ppid=' && test "\${BOOTSTRAP_DENY_PS:-0}" = 0
  `
  await writeFixtureCommand(bin, 'ps', hostProbe)
}

async function assertMissingAstPreparesWithoutSetup(root: string): Promise<void> {
  await FS.mkdir(Path.join(root, 'ts/node_modules'))
  for (const [launcher, command] of [['agent', 'agent'], ['dev', 'dev'], ['tao', 'tao']] as const) {
    await removeGeneratedAst(root)
    await writeCalls(root, '')
    const result = await runLauncher(root, launcher, ['--help'])
    Tests.expect(result.status).toBe(0)
    Tests.expect(await readCalls(root)).toBe(`prepare\n${command}:run ${resolveCLIEntry(command)} --help\n`)
  }
}

async function assertExplicitSetupBypassesPreflight(root: string): Promise<void> {
  await FS.rm(Path.join(root, 'ts/node_modules'), { recursive: true, force: true })
  await removeGeneratedAst(root)
  await writeCalls(root, '')
  const plain = await runLauncher(root, 'agent', ['setup'])
  Tests.expect(plain.status).toBe(1)
  Tests.expect(plain.stderr).toContain('./agent unsandboxed setup')
  Tests.expect(await readCalls(root)).toBe('')
  const denied = await runLauncher(root, 'agent', ['unsandboxed', 'setup'], { BOOTSTRAP_DENY_PS: '1' })
  Tests.expect(denied.status).toBe(1)
  Tests.expect(denied.stderr).toContain('Host process access is unavailable')
  Tests.expect(await readCalls(root)).toBe('')
  for (const [launcher, args] of [['agent', ['unsandboxed', 'setup']], ['dev', ['setup']]] as const) {
    await removeGeneratedAst(root)
    await writeCalls(root, '')
    const result = await runLauncher(root, launcher, args)
    Tests.expect(result.status).toBe(0)
    Tests.expect(await readCalls(root)).toBe('setup\n')
  }
}

async function assertMissingDependenciesRequireSetup(root: string): Promise<void> {
  await FS.rm(Path.join(root, 'ts/node_modules'), { recursive: true, force: true })
  await removeGeneratedAst(root)
  await writeCalls(root, '')
  const result = await runLauncher(root, 'dev', ['--help'])
  Tests.expect(result.status).toBe(1)
  Tests.expect(result.stderr).toContain('./agent unsandboxed setup')
  Tests.expect(await readCalls(root)).toBe('')
}

async function assertPreparationFailureStopsLauncher(root: string): Promise<void> {
  await FS.mkdir(Path.join(root, 'ts/node_modules'))
  await removeGeneratedAst(root)
  await writeCalls(root, '')
  const result = await runLauncher(root, 'dev', ['--help'], { BOOTSTRAP_FAILURE_STATUS: '23' })
  Tests.expect(result.status).toBe(23)
  Tests.expect(result.stderr).toContain('./agent unsandboxed setup')
  Tests.expect(await readCalls(root)).toBe('prepare\n')
}

async function assertExistingAstSkipsSetup(root: string): Promise<void> {
  const ast = Path.join(root, 'ts/2-ast-gen/_gen_AST/AST-generated.ts')
  await FS.writeFile(ast, '', 'utf8')
  await writeCalls(root, '')
  for (const [launcher, command] of [['agent', 'agent'], ['dev', 'dev'], ['tao', 'tao']] as const) {
    const result = await runLauncher(root, launcher, ['--help'])
    Tests.expect(result.status).toBe(0)
    Tests.expect(await readCalls(root)).toBe(`${command}:run ${resolveCLIEntry(command)} --help\n`)
    await writeCalls(root, '')
  }
}

async function assertVerifyChecksExistingAst(root: string): Promise<void> {
  const verifyRoutes = [
    ['agent', ['verify']],
    ['agent', ['unsandboxed', 'verify']],
    ['dev', ['verify']],
  ] as const
  for (const [launcher, args] of verifyRoutes) {
    await writeCalls(root, '')
    const result = await runLauncher(root, launcher, args)
    Tests.expect(result.status).toBe(0)
    Tests.expect(await readCalls(root)).toBe(
      `prepare\n${launcher}:run ${resolveCLIEntry(launcher)} ${args.join(' ')}\n`,
    )
  }
  await writeCalls(root, '')
  const failed = await runLauncher(root, 'dev', ['verify'], { BOOTSTRAP_FAILURE_STATUS: '23' })
  Tests.expect(failed.status).toBe(23)
  Tests.expect(await readCalls(root)).toBe('prepare\n')
}

type CLICommand = 'agent' | 'dev' | 'tao'

function resolveCLIEntry(command: CLICommand): string {
  const entries = {
    agent: './CLIs/CLIs-src/agent-cli/agent-cli.ts',
    dev: './CLIs/CLIs-src/dev-cli/dev-cli.ts',
    tao: './CLIs/CLIs-src/tao-cli/tao-cli.ts',
  }
  return entries[command]
}

async function writeFixtureCommand(bin: string, name: string, source: string): Promise<void> {
  const path = Path.join(bin, name)
  await FS.writeFile(path, source, 'utf8')
  await FS.chmod(path, 0o755)
}

function fakeBunScript(): string {
  return S`
    #!/bin/sh
    case "$*" in
      *commands/_setup.ts*)
        printf 'setup\\n' >> "$BOOTSTRAP_LOG"
        if [ -n "$BOOTSTRAP_FAILURE_STATUS" ]; then exit "$BOOTSTRAP_FAILURE_STATUS"; fi
        mkdir -p "$TAO_CLI_ROOT/ts/2-ast-gen/_gen_AST"
        : > "$TAO_CLI_ROOT/ts/2-ast-gen/_gen_AST/AST-generated.ts"
        ;;
      *prepare-cli-generated.ts*)
        test "$PWD" = "$TAO_CLI_ROOT/ts" || exit 96
        printf 'prepare\\n' >> "$BOOTSTRAP_LOG"
        if [ -n "$BOOTSTRAP_FAILURE_STATUS" ]; then exit "$BOOTSTRAP_FAILURE_STATUS"; fi
        mkdir -p "$TAO_CLI_ROOT/ts/2-ast-gen/_gen_AST"
        : > "$TAO_CLI_ROOT/ts/2-ast-gen/_gen_AST/AST-generated.ts"
        ;;
      *agent-cli.ts*)
        test -f "$TAO_CLI_ROOT/ts/2-ast-gen/_gen_AST/AST-generated.ts" || exit 97
        printf 'agent:%s\\n' "$*" >> "$BOOTSTRAP_LOG"
        ;;
      *dev-cli.ts*)
        test -f "$TAO_CLI_ROOT/ts/2-ast-gen/_gen_AST/AST-generated.ts" || exit 97
        printf 'dev:%s\\n' "$*" >> "$BOOTSTRAP_LOG"
        ;;
      *tao-cli.ts*)
        test -f "$TAO_CLI_ROOT/ts/2-ast-gen/_gen_AST/AST-generated.ts" || exit 97
        printf 'tao:%s\\n' "$*" >> "$BOOTSTRAP_LOG"
        ;;
      *) exit 99 ;;
    esac
  `
}

async function runLauncher(
  root: string,
  launcher: string,
  args: readonly string[],
  extraEnvironment: Record<string, string> = {},
): Promise<LauncherResult> {
  const addEnv = {
    PATH: `${Path.join(root, 'bin')}:${Env.get('PATH') ?? ''}`,
    BOOTSTRAP_LOG: Path.join(root, 'calls'),
    DEVENV_ROOT: root,
    TAO_CLI_ROOT: root,
    TAO_DEVENV: '1',
    ...extraEnvironment,
  }
  const child = Exec.spawn(Path.join(root, launcher), args, { cwd: root, addEnv })
  const [stdout, stderr, status] = await Promise.all([
    Exec.readText(child.stdout),
    Exec.readText(child.stderr),
    child.exited,
  ])
  return { status, stdout, stderr }
}

async function removeGeneratedAst(root: string): Promise<void> {
  await FS.rm(Path.join(root, 'ts/2-ast-gen/_gen_AST/AST-generated.ts'), { force: true })
}

async function readCalls(root: string): Promise<string> {
  return await FS.readFile(Path.join(root, 'calls'), 'utf8')
}

async function writeCalls(root: string, contents: string): Promise<void> {
  await FS.writeFile(Path.join(root, 'calls'), contents, 'utf8')
}
