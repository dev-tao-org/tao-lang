import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { runDirenvSetup, type SetupEnvironment } from '../dev-cli/shell/DirenvSetup'

const identity = 'a'.repeat(40)
const sourceLine = '[[ ! -r "$HOME/.tao-dev/shell/activation.zsh" ]] || source "$HOME/.tao-dev/shell/activation.zsh"'

type FixtureState = {
  choice: string
  commandCalls: Array<{ args: readonly string[]; command: string }>
  environment: SetupEnvironment
  output: string[]
  prompts: Array<{ defaultValue?: boolean; message: string }>
  root: string
  shell: string
  zshrc: string
}

async function createFixtureRoot(): Promise<{ home: string; root: string }> {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-direnv-setup-'))
  const home = Path.join(root, 'developer-home')
  await FileSystem.mkdir(home, { recursive: true })
  return { home, root }
}

async function writeFixtureTree(root: string, home: string): Promise<FixturePaths> {
  const common = Path.join(root, 'common-git')
  const shell = Path.join(home, '.tao-dev/shell')
  const choice = Path.join(shell, 'repositories', identity, 'choice')
  const zshrc = Path.join(home, '.zshrc')
  const profileClient = Path.join(root, '.devenv/profile/bin/direnv')
  const packageOutput = Path.join(root, 'nix/store/0123456789abcdfghijklmnpqrsvwxyz-direnv-2.37.1')
  const storeDirenv = Path.join(packageOutput, 'bin/direnv')
  await FileSystem.mkdir(common, { recursive: true })
  await FileSystem.mkdir(Path.join(root, '.artifacts/cache/dev-shell'), { recursive: true })
  await FileSystem.mkdir(Path.join(packageOutput, 'bin'), { recursive: true })
  await FileSystem.writeFile(storeDirenv, 'direnv', 'utf8')
  await FileSystem.mkdir(Path.join(profileClient, '..'), { recursive: true })
  await FileSystem.symlink(storeDirenv, profileClient)
  await FileSystem.mkdir(Path.join(root, 'ts/CLIs/CLIs-src/dev-cli/shell'), { recursive: true })
  await FileSystem.writeFile(
    Path.join(root, 'ts/CLIs/CLIs-src/dev-cli/shell/direnv-activation.zsh'),
    '# runtime fixture\n',
    'utf8',
  )
  await FileSystem.writeFile(Path.join(root, '.envrc'), '# envrc fixture\n', 'utf8')
  await FileSystem.writeFile(
    Path.join(root, '.artifacts/cache/dev-shell/completion.zsh'),
    '# completion fixture\n',
    'utf8',
  )
  await FileSystem.writeFile(zshrc, '# personal settings\nexport EDITOR=vim', 'utf8')
  return { choice, common, packageOutput, shell, zshrc }
}

type FixturePaths = {
  choice: string
  common: string
  packageOutput: string
  shell: string
  zshrc: string
}

function createFixtureEnvironment(
  root: string,
  home: string,
  paths: FixturePaths,
  output: string[],
  prompts: Array<{ defaultValue?: boolean; message: string }>,
  commandCalls: Array<{ args: readonly string[]; command: string }>,
): SetupEnvironment {
  return {
    interactive: () => true,
    async confirm(options) {
      prompts.push(options)
      return true
    },
    resolveDirenvPackage: () => paths.packageOutput,
    write(text) {
      output.push(text)
    },
    root: () => root,
    env: { HOME: home, SHELL: '/bin/zsh' },
    async run(command, spec = {}) {
      commandCalls.push({ args: spec.args ?? [], command })
      return await mockCommand(root, paths, command, spec)
    },
  }
}

async function mockCommand(
  root: string,
  paths: FixturePaths,
  command: string,
  spec: { args?: readonly string[] },
): Promise<{ command: string; exitCode: number; stderr: string; stdout: string }> {
  const stdout = command === 'git'
    ? spec.args?.[0] === 'rev-parse'
      ? `${paths.common}\n`
      : spec.args?.[0] === 'worktree'
      ? `worktree ${root}\0HEAD ${identity}\0\0`
      : `${identity}\n`
    : ''
  if (command === 'nix-store') {
    const addRoot = spec.args?.[3] ?? ''
    await FileSystem.mkdir(Path.join(addRoot, 'bin'), { recursive: true })
    await FileSystem.writeFile(Path.join(addRoot, 'bin/direnv'), 'direnv', 'utf8')
  }
  return { command, exitCode: 0, stdout, stderr: '' }
}

async function createFixture(): Promise<FixtureState> {
  const { home, root } = await createFixtureRoot()
  const paths = await writeFixtureTree(root, home)
  const output: string[] = []
  const prompts: Array<{ defaultValue?: boolean; message: string }> = []
  const commandCalls: Array<{ args: readonly string[]; command: string }> = []
  return {
    choice: paths.choice,
    commandCalls,
    environment: createFixtureEnvironment(root, home, paths, output, prompts, commandCalls),
    output,
    prompts,
    root,
    shell: paths.shell,
    zshrc: paths.zshrc,
  }
}

async function withFixture(run: (fixtureState: FixtureState) => Promise<void>): Promise<void> {
  const fixtureState = await createFixture()
  await Try(() => run(fixtureState), {
    finally: () => FileSystem.rm(fixtureState.root, { recursive: true, force: true }),
  })
}

Tests.test('shell setup uses a short consent prompt and enables activation once accepted', async () => {
  await withFixture(async fixtureState => {
    Tests.expect(await runDirenvSetup({}, fixtureState.environment)).toBe(0)
    Tests.expect(fixtureState.prompts[0]?.message).toBe(
      "Auto-load Tao's dev environment in zsh when you enter this repo (and its worktrees)?",
    )
    Tests.expect(await FileSystem.readFile(fixtureState.zshrc, 'utf8')).toContain(sourceLine)
    Tests.expect(await FileSystem.readFile(Path.join(fixtureState.shell, 'activation.zsh'), 'utf8')).toBe(
      '# runtime fixture\n',
    )
    Tests.expect(await FileSystem.readFile(fixtureState.choice, 'utf8')).toBe('enabled\n')
  })
})

Tests.test('reconfiguring an enabled shell setup off revokes only its direnv allowance', async () => {
  await withFixture(async fixtureState => {
    await runDirenvSetup({}, fixtureState.environment)
    fixtureState.commandCalls.length = 0
    await FileSystem.writeFile(Path.join(fixtureState.shell, 'activation.zsh'), '# stale runtime\n', 'utf8')
    fixtureState.environment.confirm = async options => {
      fixtureState.prompts.push(options)
      return false
    }

    Tests.expect(await runDirenvSetup({ configure: true }, fixtureState.environment)).toBe(0)
    Tests.expect(await FileSystem.readFile(fixtureState.choice, 'utf8')).toBe('disabled\n')
    Tests.expect(fixtureState.commandCalls).toContainEqual({
      args: ['deny', fixtureState.root],
      command: 'direnv',
    })
    Tests.expect(await FileSystem.readFile(Path.join(fixtureState.shell, 'activation.zsh'), 'utf8')).toBe(
      '# runtime fixture\n',
    )
    Tests.expect(fixtureState.output.at(-1)).toContain('./agent shell-setup --configure')
    Tests.expect(fixtureState.output.at(-1)).toContain('every already-open zsh terminal')
    Tests.expect(fixtureState.output.at(-1)).toContain(sourceLine)
  })
})

Tests.test('shell setup preserves a broken shell configuration symlink', async () => {
  await withFixture(async fixture => {
    const missingTarget = Path.join(fixture.root, 'missing-managed-zshrc')
    await FileSystem.rm(fixture.zshrc)
    await FileSystem.symlink(missingTarget, fixture.zshrc)
    await Tests.expect(runDirenvSetup({}, fixture.environment)).rejects.toThrow('Could not update shell configuration')
    Tests.expect(FileSystem.lstatSync(fixture.zshrc).isSymbolicLink()).toBe(true)
    Tests.expect(FileSystem.existsSync(missingTarget)).toBe(false)
  })
})
