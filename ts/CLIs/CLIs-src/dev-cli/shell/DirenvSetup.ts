import { IO } from '@cli-kit'
import { Errors, NewlineCharacter, Regxs, S, Try } from '@shared'
import { Env, FS, Path, Repo, Terminal } from '@shared/os'
import type { CommandArgs } from '@shared/os/exec'
import { type CommandResult, runCapturedCommand, type RunOptions } from './DirenvSetupCommands'
import * as DirenvSetupFiles from './DirenvSetupFiles'
import { prepareDevelopmentShell } from './DirenvSetupPreparation'

export { runDirenvSetup, type SetupEnvironment }

const ACTIVATION_SOURCE = 'ts/CLIs/CLIs-src/dev-cli/shell/direnv-activation.zsh'

/** SetupEnvironment injects shell and process dependencies for direnv setup. */
type SetupEnvironment = {
  confirm: typeof IO.askConfirm
  interactive: () => boolean
  root: () => string
  run: (command: string, args?: CommandArgs, options?: RunOptions) => Promise<CommandResult>
  write: (message: string) => void
}

/** runDirenvSetup offers optional zsh activation through pinned direnv for this Git identity. */
async function runDirenvSetup(options: { configure?: boolean; prepare?: boolean } = {}): Promise<number> {
  const environment = liveEnvironment()
  await prepareDevelopmentShell(options.prepare, environment)
  if (isSetupDisabled(environment)) {
    return 0
  }
  return await completeDirenvSetup(options, environment)
}

function liveEnvironment(): SetupEnvironment {
  return {
    confirm: IO.askConfirm,
    interactive: Terminal.isInteractive,
    root: Repo.getWorkspaceRoot,
    run: runCapturedCommand,
    write: Terminal.writeLine,
  }
}

function isSetupDisabled(environment: SetupEnvironment): boolean {
  return Env.get('TAO_DEV_SHELL_SETUP') === '0' || !environment.interactive()
}

const SETUP_PROMPT = "Auto-load Tao's dev environment in zsh when you enter this repo (and its worktrees)?"
async function completeDirenvSetup(
  options: { configure?: boolean },
  environment: SetupEnvironment,
): Promise<number> {
  const { write } = environment
  if (Path.basename(Env.get('SHELL') ?? '') !== 'zsh') {
    write('Automatic development shell activation currently supports zsh. Shell configuration was left unchanged.')
    return 0
  }
  const root = environment.root()
  const zshrc = resolveZshrcPath(root)
  const { commonDirectory, identity } = await resolveGitIdentity(root, environment)
  const shellRoot = Path.home.taoDev('shell')
  const choicePath = Path.home.taoDev('shell', 'repositories', identity, 'choice')
  if (await hasStoredChoice(options, choicePath)) {
    return 0
  }
  const accepted = await environment.confirm({ defaultValue: false, message: SETUP_PROMPT })
  await FS.mkdir(shellRoot)
  if (await hasStoredChoice(options, choicePath)) {
    return 0
  }
  const repository = Path.dirname(choicePath)
  const previousChoice = await DirenvSetupFiles.readOptionalFile(choicePath)
  const commonDirectoryPath = Path.resolve(repository, 'common-dir')
  await DirenvSetupFiles.writeFileAtomically(commonDirectoryPath, `${commonDirectory}${NewlineCharacter}`)
  if (!accepted) {
    if (previousChoice === ('enabled' + NewlineCharacter)) {
      await refreshInstalledActivation(root, shellRoot)
      await revokeDirenvAllowance(root, environment)
    }
    await DirenvSetupFiles.writeFileAtomically(choicePath, 'disabled' + NewlineCharacter)
    write(S`
      Automatic shell activation is off for new terminals. In every already-open zsh terminal, run:
      ${DirenvSetupFiles.activationSourceLine}
      Run \`./agent shell-setup --configure\` to change this repository's choice.
    `)
    return 0
  }
  await DirenvSetupFiles.writeFileAtomically(choicePath, 'pending' + NewlineCharacter)
  await installActivation(root, shellRoot, environment)
  await updateZshrcSource(zshrc)
  await DirenvSetupFiles.writeFileAtomically(choicePath, 'enabled' + NewlineCharacter)
  write(
    `Automatic shell activation is enabled. Open a new zsh terminal or run:${NewlineCharacter}${DirenvSetupFiles.activationSourceLine}`,
  )
  return 0
}

function resolveZshrcPath(root: string): string {
  const home = Path.home()
  const zdotdir = Env.get('ZDOTDIR')
  rejectLineBreaks(root, home, zdotdir ?? '')
  return zdotdir ? Path.resolve(zdotdir, '.zshrc') : Path.home('.zshrc')
}

async function revokeDirenvAllowance(root: string, environment: SetupEnvironment): Promise<void> {
  const denied = await environment.run('direnv', ['deny', root], { cwd: root })
  if (denied.status !== 0) {
    Errors.ThrowHostEnvironment(
      `Could not revoke direnv trust for ${root} (exit ${denied.status}):${NewlineCharacter}${denied.stderr.trim()}`,
    )
  }
}

async function refreshInstalledActivation(root: string, shellRoot: string): Promise<void> {
  const source = await FS.readFile(Path.resolve(root, ACTIVATION_SOURCE), 'utf8')
  await DirenvSetupFiles.writeFileAtomically(Path.resolve(shellRoot, 'activation.zsh'), source)
}

async function hasStoredChoice(
  options: { configure?: boolean },
  choicePath: string,
): Promise<boolean> {
  if (options.configure) {
    return false
  }
  const previousChoice = await DirenvSetupFiles.readOptionalFile(choicePath)
  return ['enabled' + NewlineCharacter, 'disabled' + NewlineCharacter].includes(previousChoice)
}

async function resolveGitIdentity(
  root: string,
  environment: SetupEnvironment,
): Promise<{ commonDirectory: string; identity: string }> {
  const git = await environment.run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root })
  if (git.status !== 0) {
    Errors.ThrowHostEnvironment('Shell setup requires Git and a working repository checkout.')
  }
  const commonPath = git.stdout.replace(Regxs.TrailingNewlineRegx, '')
  rejectLineBreaks(commonPath)
  const commonDirectory = FS.realpathSync(commonPath)
  rejectLineBreaks(commonDirectory)
  const hash = await environment.run('git', ['hash-object', '--stdin'], {
    cwd: root,
    stdin: `${commonDirectory}${NewlineCharacter}`,
  })
  const identity = hash.stdout.trim()
  if (hash.status !== 0 || !Regxs.LowercaseHashRangeRegx.test(identity)) {
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
  const output = (await DirenvSetupFiles.realPathIfPresent(profileClient)).match(Regxs.NixDirenvExecutableRegx)?.[1]
  if (output === undefined) {
    Errors.ThrowHostEnvironment(
      S`
        Pinned direnv is missing from this checkout. Rebuild the dev environment, then run:
        cd ${quote(root)}
        ./enter-tao-dev-env.sh
        ./agent shell-setup --configure
      `,
    )
  }
  const devenv = await environment.run('devenv', ['version'], { cwd: root })
  if (devenv.status !== 0) {
    Errors.ThrowHostEnvironment(
      `devenv version failed (exit ${devenv.status}):${NewlineCharacter}${
        devenv.stderr.trim() || devenv.stdout.trim()
      }`,
    )
  }
  const runtime = await FS.readFile(Path.resolve(root, ACTIVATION_SOURCE), 'utf8')
  const envrc = await FS.readFile(Path.resolve(root, '.envrc'), 'utf8')
  const completionPath = Path.resolve(root, '.artifacts/cache/dev-shell/completion.zsh')
  const completion = FS.existsSync(completionPath)
    ? await FS.readFile(completionPath, 'utf8')
    : ('# Tao dev shell completion is generated during ./agent unsandboxed setup.' + NewlineCharacter)
  const rooted = await environment.run('nix-store', [
    '--realise',
    output,
    '--add-root',
    Path.resolve(shellRoot, 'direnv'),
    '--indirect',
  ], {
    cwd: root,
  })
  if (rooted.status !== 0) {
    Errors.ThrowHostEnvironment(
      `Could not retain the pinned direnv package with a Nix GC root. Shell activation remains disabled.${NewlineCharacter}${rooted.stderr.trim()}`,
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
      await FS.writeFile(target, updated, 'utf8')
    }
  }, {
    catch(cause) {
      Errors.ThrowHostEnvironment(
        `Could not update shell configuration at ${zshrc}. Add this line to its managed source, then run ./agent shell-setup --configure:${NewlineCharacter}${DirenvSetupFiles.activationSourceLine}`,
        { cause },
      )
    },
  })
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function rejectLineBreaks(...paths: string[]): void {
  if (paths.some(path => Regxs.LineBreakRegx.test(path))) {
    Errors.ThrowHostEnvironment('Automatic shell activation does not support paths containing line breaks.')
  }
}
