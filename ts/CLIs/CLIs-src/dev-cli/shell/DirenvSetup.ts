import { IO } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Env, FileSystem, Path, Repo, Terminal } from '@shared/os'
import { type CommandResult, runCapturedCommand, type RunOptions } from './DirenvSetupCommands'
import * as DirenvSetupFiles from './DirenvSetupFiles'
import { prepareDevelopmentShell } from './DirenvSetupPreparation'

export { runDirenvSetup, type SetupEnvironment }

const ACTIVATION_SOURCE = 'ts/CLIs/CLIs-src/dev-cli/shell/direnv-activation.zsh'
const SETUP_PROMPT = "Auto-load Tao's dev environment in zsh when you enter this repo (and its worktrees)?"

/** SetupEnvironment injects shell and process dependencies for direnv setup. */
type SetupEnvironment = {
  confirm: typeof Terminal.askConfirm
  env: Readonly<Record<string, string | undefined>>
  interactive: () => boolean
  resolveDirenvPackage?: (profileClient: string) => string | undefined
  root: () => string
  run: (command: string, options?: RunOptions) => Promise<CommandResult>
  write: (message: string) => void
}

/** runDirenvSetup offers optional zsh activation through pinned direnv for this Git identity. */
async function runDirenvSetup(
  options: { configure?: boolean; prepare?: boolean } = {},
  environment: SetupEnvironment = liveEnvironment(),
): Promise<number> {
  await prepareDevelopmentShell(options.prepare, environment)
  if (isSetupDisabled(environment)) {
    return 0
  }
  return await completeDirenvSetup(options, environment)
}

function liveEnvironment(): SetupEnvironment {
  return {
    confirm: options => IO.prompt(() => Terminal.askConfirm(options)),
    env: Env.snapshot(),
    interactive: Terminal.isInteractive,
    root: Repo.getWorkspaceRoot,
    run: runCapturedCommand,
    write: Terminal.writeLine,
  }
}

function isSetupDisabled(environment: SetupEnvironment): boolean {
  return environment.env['TAO_DEV_SHELL_SETUP'] === '0' || !environment.interactive()
}

async function completeDirenvSetup(
  options: { configure?: boolean },
  environment: SetupEnvironment,
): Promise<number> {
  const { env, write } = environment
  if (Path.basename(env['SHELL'] ?? '') !== 'zsh') {
    write('Automatic development shell activation currently supports zsh. Shell configuration was left unchanged.')
    return 0
  }
  const root = environment.root()
  const home = requireHome(env)
  rejectLineBreaks(root, home, env['ZDOTDIR'] ?? '')
  const { commonDirectory, identity } = await resolveGitIdentity(root, environment)
  const shellRoot = Path.resolve(home, '.tao-dev/shell')
  const choicePath = Path.resolve(shellRoot, 'repositories', identity, 'choice')
  if (await hasStoredChoice(options, choicePath)) {
    return 0
  }
  const zshrc = Path.resolve(env['ZDOTDIR'] || home, '.zshrc')
  const accepted = await environment.confirm({ defaultValue: false, message: SETUP_PROMPT })
  await FileSystem.mkdir(shellRoot, { recursive: true })
  if (await hasStoredChoice(options, choicePath)) {
    return 0
  }
  const repository = Path.dirname(choicePath)
  const previousChoice = await DirenvSetupFiles.readOptionalFile(choicePath)
  await DirenvSetupFiles.writeFileAtomically(Path.resolve(repository, 'common-dir'), `${commonDirectory}\n`)
  if (!accepted) {
    if (previousChoice === 'enabled\n') {
      await refreshInstalledActivation(root, shellRoot)
      await revokeDirenvAllowance(root, environment)
    }
    await DirenvSetupFiles.writeFileAtomically(choicePath, 'disabled\n')
    write(
      `Automatic shell activation is off for new terminals. In every already-open zsh terminal, run:\n${DirenvSetupFiles.activationSourceLine}\nRun \`./agent shell-setup --configure\` to change this repository's choice.`,
    )
    return 0
  }
  await DirenvSetupFiles.writeFileAtomically(choicePath, 'pending\n')
  await installActivation(root, shellRoot, environment)
  await updateZshrcSource(zshrc)
  await DirenvSetupFiles.writeFileAtomically(choicePath, 'enabled\n')
  write(
    `Automatic shell activation is enabled. Open a new zsh terminal or run:\n${DirenvSetupFiles.activationSourceLine}`,
  )
  return 0
}

async function revokeDirenvAllowance(root: string, environment: SetupEnvironment): Promise<void> {
  const denied = await environment.run('direnv', { args: ['deny', root], cwd: root })
  if (denied.exitCode !== 0) {
    Errors.ThrowHostEnvironment(
      `Could not revoke direnv trust for ${root} (exit ${denied.exitCode}):\n${denied.stderr.trim()}`,
    )
  }
}

async function refreshInstalledActivation(root: string, shellRoot: string): Promise<void> {
  const source = await FileSystem.readFile(Path.resolve(root, ACTIVATION_SOURCE), 'utf8')
  await DirenvSetupFiles.writeFileAtomically(Path.resolve(shellRoot, 'activation.zsh'), source)
}

function requireHome(env: Readonly<Record<string, string | undefined>>): string {
  const home = env['HOME']
  if (!home) {
    Errors.ThrowHostEnvironment('Shell setup needs HOME to locate developer shell configuration.')
  }
  return home
}

async function hasStoredChoice(
  options: { configure?: boolean },
  choicePath: string,
): Promise<boolean> {
  if (options.configure) {
    return false
  }
  const previousChoice = await DirenvSetupFiles.readOptionalFile(choicePath)
  return ['enabled\n', 'disabled\n'].includes(previousChoice)
}

async function resolveGitIdentity(
  root: string,
  environment: SetupEnvironment,
): Promise<{ commonDirectory: string; identity: string }> {
  const git = await environment.run('git', {
    args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd: root,
  })
  if (git.exitCode !== 0) {
    Errors.ThrowHostEnvironment('Shell setup requires Git and a working repository checkout.')
  }
  const commonPath = git.stdout.replace(/\n$/, '')
  rejectLineBreaks(commonPath)
  const commonDirectory = FileSystem.realpathSync(commonPath)
  rejectLineBreaks(commonDirectory)
  const hash = await environment.run('git', {
    args: ['hash-object', '--stdin'],
    cwd: root,
    stdin: `${commonDirectory}\n`,
  })
  const identity = hash.stdout.trim()
  if (hash.exitCode !== 0 || !/^[a-f0-9]{40,64}$/.test(identity)) {
    Errors.ThrowHostEnvironment('Git could not identify this repository for shell setup.')
  }
  return { commonDirectory, identity }
}

async function installActivation(
  root: string,
  shellRoot: string,
  environment: SetupEnvironment,
): Promise<void> {
  const profileClient = Path.resolve(root, '.devenv/profile/bin/direnv')
  const output = environment.resolveDirenvPackage?.(profileClient)
    ?? (await DirenvSetupFiles.realPathIfPresent(profileClient)).match(
      /^(\/nix\/store\/[a-z0-9]{32}-[^/]+)\/bin\/direnv$/,
    )?.[1]
  if (output === undefined) {
    Errors.ThrowHostEnvironment(
      `Pinned direnv is missing from this checkout. Rebuild the dev environment, then run:\ncd ${
        quote(root)
      }\n./enter-tao-dev-env.sh\n./agent shell-setup --configure`,
    )
  }
  const devenv = await environment.run('devenv', { args: ['version'], cwd: root })
  if (devenv.exitCode !== 0) {
    Errors.ThrowHostEnvironment(
      `devenv version failed (exit ${devenv.exitCode}):\n${devenv.stderr.trim() || devenv.stdout.trim()}`,
    )
  }
  const runtime = await FileSystem.readFile(Path.resolve(root, ACTIVATION_SOURCE), 'utf8')
  const envrc = await FileSystem.readFile(Path.resolve(root, '.envrc'), 'utf8')
  const completionPath = Path.resolve(root, '.artifacts/cache/dev-shell/completion.zsh')
  const completion = FileSystem.existsSync(completionPath)
    ? await FileSystem.readFile(completionPath, 'utf8')
    : '# Tao dev shell completion is generated during ./agent setup.\n'
  const rooted = await environment.run('nix-store', {
    args: ['--realise', output, '--add-root', Path.resolve(shellRoot, 'direnv'), '--indirect'],
    cwd: root,
  })
  if (rooted.exitCode !== 0) {
    Errors.ThrowHostEnvironment(
      `Could not retain the pinned direnv package with a Nix GC root. Shell activation remains disabled.\n${rooted.stderr.trim()}`,
    )
  }
  await DirenvSetupFiles.writeFileAtomically(Path.resolve(shellRoot, 'activation.zsh'), runtime)
  await DirenvSetupFiles.writeFileAtomically(Path.resolve(shellRoot, 'envrc'), envrc)
  await DirenvSetupFiles.writeFileAtomically(Path.resolve(shellRoot, 'completion.zsh'), completion)
}

async function updateZshrcSource(zshrc: string): Promise<void> {
  await Try(async () => {
    const target = DirenvSetupFiles.resolveZshrcTarget(zshrc)
    const existing = await DirenvSetupFiles.readOptionalFile(target)
    const updated = DirenvSetupFiles.mergeActivationSourceLine(existing)
    if (updated !== existing) {
      await FileSystem.writeFile(target, updated, 'utf8')
    }
  }, {
    catch(cause) {
      Errors.ThrowHostEnvironment(
        `Could not update shell configuration at ${zshrc}. Add this line to its managed source, then run ./agent shell-setup --configure:\n${DirenvSetupFiles.activationSourceLine}`,
        { cause },
      )
    },
  })
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function rejectLineBreaks(...paths: string[]): void {
  if (paths.some(path => /[\r\n]/.test(path))) {
    Errors.ThrowHostEnvironment('Automatic shell activation does not support paths containing line breaks.')
  }
}
