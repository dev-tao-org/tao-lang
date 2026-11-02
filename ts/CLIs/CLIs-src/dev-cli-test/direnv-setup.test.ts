import { NewlineCharacter, S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { runDirenvSetup, type SetupEnvironment } from '../dev-cli/shell/DirenvSetup'

const identity = 'a'.repeat(40)
const sourceLine = '[[ ! -r "$HOME/.tao-dev/shell/activation.zsh" ]] || source "$HOME/.tao-dev/shell/activation.zsh"'

type FixtureState = {
  choice: string
  packageOutput: string
  root: string
  shell: string
  zshrc: string
}
type OptionalSetupStatus = number | undefined
type OptionalSetupError = string | undefined
type OptionalGitArguments = readonly string[] | undefined

type SetupRunResult = {
  commandCalls: Array<{ args: readonly string[]; command: string }>
  error?: string
  output: string[]
  prompts: Array<{ defaultValue?: boolean; message: string }>
  status: OptionalSetupStatus
}
type FixturePaths = {
  choice: string
  common: string
  packageOutput: string
  shell: string
  zshrc: string
}

async function createFixtureRoot(): Promise<{ home: string; root: string }> {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-direnv-setup-'))
  const home = Path.join(root, 'developer-home')
  await FileSystem.mkdir(home)
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
  const gcRootDirenv = Path.join(shell, 'direnv/bin/direnv')
  await FileSystem.mkdirs(common, Path.join(root, '.artifacts/cache/dev-shell'), Path.join(packageOutput, 'bin'))
  await FileSystem.mkdir(Path.dirname(gcRootDirenv))
  await FileSystem.writeFile(storeDirenv, 'direnv', 'utf8')
  await FileSystem.writeFile(gcRootDirenv, 'direnv', 'utf8')
  await FileSystem.mkdir(Path.join(profileClient, '..'))
  await FileSystem.symlink(storeDirenv, profileClient)
  await FileSystem.mkdir(Path.join(root, 'ts/CLIs/CLIs-src/dev-cli/shell'))
  await FileSystem.writeFile(
    Path.join(root, 'ts/CLIs/CLIs-src/dev-cli/shell/direnv-activation.zsh'),
    '# runtime fixture' + NewlineCharacter,
    'utf8',
  )
  await FileSystem.writeFile(Path.join(root, '.envrc'), '# envrc fixture' + NewlineCharacter, 'utf8')
  await FileSystem.writeFile(
    Path.join(root, '.artifacts/cache/dev-shell/completion.zsh'),
    '# completion fixture' + NewlineCharacter,
    'utf8',
  )
  await FileSystem.writeFile(
    zshrc,
    S`
      # personal settings
      export EDITOR=vim
    `,
    'utf8',
  )
  return { choice, common, packageOutput, shell, zshrc }
}

async function createFixture(): Promise<FixtureState> {
  const { home, root } = await createFixtureRoot()
  const paths = await writeFixtureTree(root, home)
  return {
    choice: paths.choice,
    packageOutput: paths.packageOutput,
    root,
    shell: paths.shell,
    zshrc: paths.zshrc,
  }
}

async function executeSetup(
  fixture: FixtureState,
  accept: boolean,
  configure = false,
  zdotdir?: string,
): Promise<SetupRunResult> {
  const testEnvironment = {
    HOME: Path.dirname(Path.dirname(fixture.shell)),
    SHELL: '/bin/zsh',
    TAO_DEV_SHELL_SETUP: '1',
    ZDOTDIR: zdotdir,
  }
  const commandCalls: Array<{ args: readonly string[]; command: string }> = []
  const output: string[] = []
  const prompts: Array<{ defaultValue?: boolean; message: string }> = []
  let status: OptionalSetupStatus
  let error: OptionalSetupError
  const environment: SetupEnvironment = {
    interactive: () => true,
    root: () => fixture.root,
    resolveDirenvPackage: () => fixture.packageOutput,
    async confirm(options) {
      prompts.push(options)
      return accept
    },
    write: message => output.push(message),
    async run(command, spec = {}) {
      commandCalls.push({ args: spec.args ?? [], command })
      const stdout = command === 'git' ? resolveGitOutput(spec.args, fixture.root) : ''
      return { status: 0, stdout, stderr: '' }
    },
  }
  await Tests.withEnv(testEnvironment, () =>
    Try(async () => {
      status = await runDirenvSetup({ configure }, environment)
    }, {
      catch(cause) {
        error = String(cause)
      },
    }))
  return { commandCalls, error, output, prompts, status }
}

function resolveGitOutput(args: OptionalGitArguments, root: string): string {
  if (args?.[0] === 'rev-parse') {
    return `${Path.join(root, 'common-git')}${NewlineCharacter}`
  }
  return `${identity}${NewlineCharacter}`
}

async function withFixture(run: (fixtureState: FixtureState) => Promise<void>): Promise<void> {
  const fixtureState = await createFixture()
  await Try(() => run(fixtureState), {
    finally: () => FileSystem.rm(fixtureState.root, { recursive: true, force: true }),
  })
}

Tests.test('shell setup uses a short consent prompt and enables activation once accepted', async () => {
  await withFixture(async fixtureState => {
    const result = await executeSetup(fixtureState, true)
    Tests.expect({ status: result.status, error: result.error }).toEqual({ status: 0, error: undefined })
    Tests.expect(result.prompts[0]?.message).toBe(
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
    await executeSetup(fixtureState, true)
    await FileSystem.writeFile(
      Path.join(fixtureState.shell, 'activation.zsh'),
      '# stale runtime' + NewlineCharacter,
      'utf8',
    )
    const result = await executeSetup(fixtureState, false, true)
    Tests.expect({ status: result.status, error: result.error }).toEqual({ status: 0, error: undefined })
    Tests.expect(await FileSystem.readFile(fixtureState.choice, 'utf8')).toBe('disabled\n')
    Tests.expect(result.commandCalls).toContainEqual({
      args: ['deny', fixtureState.root],
      command: 'direnv',
    })
    Tests.expect(await FileSystem.readFile(Path.join(fixtureState.shell, 'activation.zsh'), 'utf8')).toBe(
      '# runtime fixture\n',
    )
    Tests.expect(result.output.at(-1)).toContain('./agent shell-setup --configure')
    Tests.expect(result.output.at(-1)).toContain('every already-open zsh terminal')
    Tests.expect(result.output.at(-1)).toContain(sourceLine)
  })
})

Tests.test('shell setup updates the zsh configuration selected by ZDOTDIR', async () => {
  await withFixture(async fixture => {
    const zdotdir = Path.join(fixture.root, 'zsh-config')
    const zshrc = Path.join(zdotdir, '.zshrc')
    await FileSystem.mkdir(zdotdir)
    await FileSystem.writeFile(zshrc, '# alternate zsh settings' + NewlineCharacter, 'utf8')
    const result = await executeSetup(fixture, true, false, zdotdir)
    Tests.expect(result.status).toBe(0)
    Tests.expect(await FileSystem.readFile(zshrc, 'utf8')).toContain(sourceLine)
    Tests.expect(await FileSystem.readFile(fixture.zshrc, 'utf8')).not.toContain(sourceLine)
  })
})

Tests.test('shell setup preserves a broken shell configuration symlink', async () => {
  await withFixture(async fixture => {
    const missingTarget = Path.join(fixture.root, 'missing-managed-zshrc')
    await FileSystem.rm(fixture.zshrc)
    await FileSystem.symlink(missingTarget, fixture.zshrc)
    const result = await executeSetup(fixture, true)
    Tests.expect(result.error).toContain('Could not update shell configuration')
    Tests.expect(FileSystem.lstatSync(fixture.zshrc).isSymbolicLink()).toBe(true)
    Tests.expect(FileSystem.existsSync(missingTarget)).toBe(false)
  })
})
