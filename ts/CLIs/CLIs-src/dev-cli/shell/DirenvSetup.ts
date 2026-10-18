import { Errors, Try } from '@shared'
import { Env, FileSystem, Path, Platform, Repo, Terminal } from '@shared/os'
import { type CommandResult, runCapturedCommand, type RunOptions } from './DirenvSetupCommands'

const ACTIVATION_SOURCE = 'ts/CLIs/CLIs-src/dev-cli/shell/direnv-activation.zsh'
const SOURCE_LINE = '[[ ! -r "$HOME/.tao-dev/shell/activation.zsh" ]] || source "$HOME/.tao-dev/shell/activation.zsh"'
const LEGACY_SOURCE_LINES = new Set([
  `[[ ! -r '$HOME/.tao-dev/shell/activation.zsh' ]] || source '$HOME/.tao-dev/shell/activation.zsh'`,
])
const SETUP_PROMPT = "Auto-load Tao's dev environment in zsh when you enter this repo (and its worktrees)?"

/** SetupEnvironment injects shell and process dependencies for direnv setup. */
export type SetupEnvironment = {
  confirm: typeof Terminal.askConfirm
  env: Readonly<Record<string, string | undefined>>
  interactive: () => boolean
  resolveDirenvPackage?: (profileClient: string) => string | undefined
  root: () => string
  run: (command: string, options?: RunOptions) => Promise<CommandResult>
  write: (message: string) => void
}

/** runDirenvSetup offers optional zsh activation through pinned direnv for this Git identity. */
export async function runDirenvSetup(
  options: { configure?: boolean; prepare?: boolean } = {},
  environment: SetupEnvironment = liveEnvironment(),
): Promise<number> {
  await runPrepareStep(options.prepare, environment)
  if (isSetupDisabled(environment)) {
    return 0
  }
  return await completeDirenvSetup(options, environment)
}

function liveEnvironment(): SetupEnvironment {
  return {
    confirm: Terminal.askConfirm,
    env: Env.snapshot(),
    interactive: Terminal.isInteractive,
    root: Repo.getWorkspaceRoot,
    run: runCapturedCommand,
    write: Terminal.writeLine,
  }
}

async function runPrepareStep(prepare: boolean | undefined, environment: SetupEnvironment): Promise<void> {
  if (!prepare) {
    return
  }
  await Try(() => prepareEnvironment(environment), {
    catch(cause) {
      environment.write(
        `Development shell preparation was unavailable; directory entry will retry normally.\n${errorMessage(cause)}`,
      )
    },
  })
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
  await atomicWrite(Path.resolve(repository, 'common-dir'), `${commonDirectory}\n`)
  await atomicWrite(choicePath, accepted ? 'pending\n' : 'disabled\n')
  if (!accepted) {
    write('Automatic shell activation is off for this repository. Run `./agent shell-setup` to change that.')
    return 0
  }
  await installActivation(root, shellRoot, environment)
  await updateZshrcSource(zshrc)
  await atomicWrite(choicePath, 'enabled\n')
  write(`Automatic shell activation is enabled. Open a new zsh terminal or run:\n${SOURCE_LINE}`)
  return 0
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
  const previousChoice = await readOptional(choicePath)
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
    ?? (await realPathOptional(profileClient)).match(/^(\/nix\/store\/[a-z0-9]{32}-[^/]+)\/bin\/direnv$/)?.[1]
  if (output === undefined) {
    Errors.ThrowHostEnvironment(
      `Pinned direnv is missing from this checkout. Rebuild the dev environment, then run:\ncd ${
        quote(root)
      }\n./enter-tao-dev-env.sh\n./agent shell-setup`,
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
  await atomicWrite(Path.resolve(shellRoot, 'activation.zsh'), runtime)
  await atomicWrite(Path.resolve(shellRoot, 'envrc'), envrc)
  await atomicWrite(Path.resolve(shellRoot, 'completion.zsh'), completion)
}

async function updateZshrcSource(zshrc: string): Promise<void> {
  await Try(async () => {
    const target = resolveZshrcTarget(zshrc)
    const existing = await readOptional(target)
    const updated = mergeSourceLine(existing)
    if (updated !== existing) {
      await FileSystem.writeFile(target, updated, 'utf8')
    }
  }, {
    catch(cause) {
      Errors.ThrowHostEnvironment(
        `Could not update shell configuration at ${zshrc}. Add this line to its managed source, then run ./agent shell-setup again:\n${SOURCE_LINE}`,
        { cause },
      )
    },
  })
}

function resolveZshrcTarget(zshrc: string): string {
  if (FileSystem.existsSync(zshrc) || isSymlink(zshrc)) {
    return FileSystem.realpathSync(zshrc)
  }
  return zshrc
}

function mergeSourceLine(existing: string): string {
  let sourced = false
  const normalized = existing.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed !== SOURCE_LINE && !LEGACY_SOURCE_LINES.has(trimmed)) {
      return [line]
    }
    if (sourced) {
      return []
    }
    sourced = true
    return [trimmed === SOURCE_LINE ? line : SOURCE_LINE]
  }).join('\n')
  return sourced
    ? normalized
    : `${normalized}${normalized && !normalized.endsWith('\n') ? '\n' : ''}${SOURCE_LINE}\n`
}

async function prepareEnvironment(environment: SetupEnvironment): Promise<void> {
  if (!await shouldPrepareEnvironment(environment)) {
    return
  }
  await runDevenvShellPrepare(environment)
}

async function shouldPrepareEnvironment(environment: SetupEnvironment): Promise<boolean> {
  const { env } = environment
  const home = env['HOME']
  if (!home || !FileSystem.existsSync(Path.resolve(home, '.tao-dev/shell/repositories'))) {
    return false
  }
  const root = environment.root()
  const canonicalRoot = FileSystem.realpathSync(root)
  if (
    env['TAO_DEVENV'] === '1' && env['DEVENV_ROOT']
    && FileSystem.realpathSync(env['DEVENV_ROOT']) === canonicalRoot
  ) {
    return false
  }
  if (!FileSystem.existsSync(Path.resolve(root, 'devenv.nix'))) {
    return false
  }
  const git = await environment.run('git', {
    args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd: root,
  })
  if (git.exitCode !== 0) {
    return false
  }
  const common = FileSystem.realpathSync(git.stdout.trim())
  const hash = await environment.run('git', {
    args: ['hash-object', '--stdin'],
    cwd: root,
    stdin: `${common}\n`,
  })
  if (hash.exitCode !== 0 || !/^[a-f0-9]{40,64}$/.test(hash.stdout.trim())) {
    return false
  }
  const record = Path.resolve(home, '.tao-dev/shell/repositories', hash.stdout.trim())
  if (
    await readOptional(Path.resolve(record, 'choice')) !== 'enabled\n'
    || await readOptional(Path.resolve(record, 'common-dir')) !== `${common}\n`
  ) {
    return false
  }
  const worktrees = await environment.run('git', {
    args: ['worktree', 'list', '--porcelain', '-z'],
    cwd: root,
  })
  return worktrees.exitCode === 0 && worktrees.stdout.split('\0').includes(`worktree ${canonicalRoot}`)
}

async function runDevenvShellPrepare(environment: SetupEnvironment): Promise<void> {
  const { env, run, write } = environment
  const root = environment.root()
  write('Preparing this checkout’s development shell for automatic directory entry...')
  const prepared = await run('devenv', {
    args: ['shell', '--no-tui', '--', 'true'],
    cwd: root,
    env: { ...env, DEVENV_TUI: 'false' },
    timeoutMs: 60_000,
  })
  if (prepared.exitCode !== 0) {
    write(
      `Development shell preparation was unavailable (exit ${prepared.exitCode}); directory entry will retry normally.\n${prepared.stderr.trim()}`,
    )
  }
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function rejectLineBreaks(...paths: string[]): void {
  if (paths.some(path => /[\r\n]/.test(path))) {
    Errors.ThrowHostEnvironment('Automatic shell activation does not support paths containing line breaks.')
  }
}

async function readOptional(path: string): Promise<string> {
  return FileSystem.existsSync(path) ? await FileSystem.readFile(path, 'utf8') : ''
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const staged = `${path}.${Platform.randomUUID()}.tmp`
  await Try(async () => {
    await FileSystem.mkdir(Path.dirname(path), { recursive: true })
    await FileSystem.writeFile(staged, content, 'utf8')
    await FileSystem.rename(staged, path)
  }, {
    finally() {
      return FileSystem.rm(staged, { force: true })
    },
  })
}

async function realPathOptional(path: string): Promise<string> {
  return await Try(() => FileSystem.realpathSync(path), { catch: () => '' })
}

function isSymlink(path: string): boolean {
  return Try(() => FileSystem.statSync(path).isSymbolicLink(), { catch: () => false })
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
