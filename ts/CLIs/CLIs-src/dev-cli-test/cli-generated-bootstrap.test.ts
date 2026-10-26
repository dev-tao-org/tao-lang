import { S, Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'

Tests.test('CLI launchers prepare missing semantic AST before loading commands', async () => {
  await FileSystem.mkdir(Artifacts.resolvePath('tmp'), { recursive: true })
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-generated-bootstrap-'))
  await Try(async () => {
    await createLauncherFixture(root)
    await assertMissingAstPreparesWithoutSetup(root)
    await assertExplicitSetupBypassesPreflight(root)
    await assertMissingDependenciesRequireSetup(root)
    await assertPreparationFailureStopsLauncher(root)
    await assertExistingAstSkipsSetup(root)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

type LauncherResult = { status: number; stdout: string; stderr: string }

async function createLauncherFixture(root: string): Promise<void> {
  const bin = Path.join(root, 'bin')
  await FileSystem.mkdir(Path.join(root, '.config'), { recursive: true })
  await FileSystem.mkdir(bin, { recursive: true })
  await FileSystem.mkdir(Path.join(root, 'ts/2-ast-gen/_gen_AST'), { recursive: true })
  for (const launcher of ['agent', 'dev', 'tao']) {
    await FileSystem.cp(Repo.resolvePath(launcher), Path.join(root, launcher))
  }
  for (const config of ['cli-environment.sh', 'prepared-environment.sh', 'ensure-cli-generated.sh']) {
    await FileSystem.cp(Repo.resolvePath(`.config/${config}`), Path.join(root, '.config', config))
  }
  await writeFixtureCommand(bin, 'git', '#!/bin/sh\nprintf fixture-hash\\n\n')
  await writeFixtureCommand(bin, 'bun', fakeBunScript())
}

async function assertMissingAstPreparesWithoutSetup(root: string): Promise<void> {
  await FileSystem.mkdir(Path.join(root, 'ts/node_modules'), { recursive: true })
  for (const [launcher, command] of [['agent', 'agent'], ['dev', 'dev'], ['tao', 'tao']] as const) {
    await removeGeneratedAst(root)
    await writeCalls(root, '')
    const result = await runLauncher(root, launcher, ['--help'])
    Tests.expect(result.status).toBe(0)
    Tests.expect(await readCalls(root)).toBe(`prepare\n${command}:run ${resolveCLIEntry(command)} --help\n`)
  }
}

async function assertExplicitSetupBypassesPreflight(root: string): Promise<void> {
  await removeGeneratedAst(root)
  await writeCalls(root, '')
  const result = await runLauncher(root, 'agent', ['setup'])
  Tests.expect(result.status).toBe(0)
  Tests.expect(await readCalls(root)).toBe('setup\n')
}

async function assertMissingDependenciesRequireSetup(root: string): Promise<void> {
  await FileSystem.rm(Path.join(root, 'ts/node_modules'), { recursive: true, force: true })
  await removeGeneratedAst(root)
  await writeCalls(root, '')
  const result = await runLauncher(root, 'dev', ['--help'])
  Tests.expect(result.status).toBe(1)
  Tests.expect(result.stderr).toContain('./agent setup')
  Tests.expect(await readCalls(root)).toBe('')
}

async function assertPreparationFailureStopsLauncher(root: string): Promise<void> {
  await FileSystem.mkdir(Path.join(root, 'ts/node_modules'), { recursive: true })
  await removeGeneratedAst(root)
  await writeCalls(root, '')
  const result = await runLauncher(root, 'dev', ['--help'], { BOOTSTRAP_FAILURE_STATUS: '23' })
  Tests.expect(result.status).toBe(23)
  Tests.expect(result.stderr).toContain('./agent setup')
  Tests.expect(await readCalls(root)).toBe('prepare\n')
}

async function assertExistingAstSkipsSetup(root: string): Promise<void> {
  const ast = Path.join(root, 'ts/2-ast-gen/_gen_AST/AST-generated.ts')
  await FileSystem.writeFile(ast, '', 'utf8')
  await writeCalls(root, '')
  for (const [launcher, command] of [['agent', 'agent'], ['dev', 'dev'], ['tao', 'tao']] as const) {
    const result = await runLauncher(root, launcher, ['--help'])
    Tests.expect(result.status).toBe(0)
    Tests.expect(await readCalls(root)).toBe(`${command}:run ${resolveCLIEntry(command)} --help\n`)
    await writeCalls(root, '')
  }
}

function resolveCLIEntry(command: 'agent' | 'dev' | 'tao'): string {
  const entries = {
    agent: './CLIs/CLIs-src/agent-cli/agent-cli.ts',
    dev: './CLIs/CLIs-src/dev-cli/dev-cli.ts',
    tao: './CLIs/CLIs-src/tao-cli/tao-cli.ts',
  }
  return entries[command]
}

async function writeFixtureCommand(bin: string, name: string, source: string): Promise<void> {
  const path = Path.join(bin, name)
  await FileSystem.writeFile(path, source, 'utf8')
  await FileSystem.chmod(path, 0o755)
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
  arguments_: readonly string[],
  extraEnvironment: Record<string, string> = {},
): Promise<LauncherResult> {
  const child = Platform.spawn(Path.join(root, launcher), {
    variadicArgs: arguments_,
    cwd: root,
    env: {
      ...Env.snapshot(),
      PATH: `${Path.join(root, 'bin')}:${Env.get('PATH') ?? ''}`,
      BOOTSTRAP_LOG: Path.join(root, 'calls'),
      DEVENV_ROOT: root,
      TAO_CLI_ROOT: root,
      TAO_DEVENV: '1',
      ...extraEnvironment,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, status] = await Promise.all([
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
    child.exited,
  ])
  return { status, stdout, stderr }
}

async function removeGeneratedAst(root: string): Promise<void> {
  await FileSystem.rm(Path.join(root, 'ts/2-ast-gen/_gen_AST/AST-generated.ts'), { force: true })
}

async function readCalls(root: string): Promise<string> {
  return await FileSystem.readFile(Path.join(root, 'calls'), 'utf8')
}

async function writeCalls(root: string, contents: string): Promise<void> {
  await FileSystem.writeFile(Path.join(root, 'calls'), contents, 'utf8')
}
