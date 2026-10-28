import { NullCharacter, Regxs, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { SetupEnvironment } from './DirenvSetup'
import { readOptionalFile } from './DirenvSetupFiles'

export { prepareDevelopmentShell }

type OptionalPrepareRequest = boolean | undefined
/** prepareDevelopmentShell optionally pre-evaluates the configured checkout's devenv shell. */
async function prepareDevelopmentShell(
  prepare: OptionalPrepareRequest,
  environment: SetupEnvironment,
): Promise<void> {
  if (!prepare) {
    return
  }
  await Try(async () => {
    if (await shouldPrepareEnvironment(environment)) {
      await runDevenvShellPrepare(environment)
    }
  }, {
    catch(cause) {
      environment.write(
        `Development shell preparation was unavailable; directory entry will retry normally.\n${errorMessage(cause)}`,
      )
    },
  })
}

async function shouldPrepareEnvironment(environment: SetupEnvironment): Promise<boolean> {
  const { env } = environment
  const home = env['HOME']
  if (!home || !FileSystem.existsSync(Path.resolve(home, '.tao-dev/shell/repositories'))) {
    return false
  }
  const root = environment.root()
  const canonicalRoot = FileSystem.realpathSync(root)
  if (isAlreadyInDevenv(env, canonicalRoot)) {
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
  if (hash.exitCode !== 0 || !Regxs.LowercaseHashRangeRegx.test(hash.stdout.trim())) {
    return false
  }
  const record = Path.resolve(home, '.tao-dev/shell/repositories', hash.stdout.trim())
  if (!await isEnabledForCommonDirectory(record, common)) {
    return false
  }
  return await isRegisteredWorktree(root, canonicalRoot, environment)
}

type EnvironmentValue = string | undefined
function isAlreadyInDevenv(env: Readonly<Record<string, EnvironmentValue>>, root: string): boolean {
  const devenvRoot = env['DEVENV_ROOT']
  return env['TAO_DEVENV'] === '1' && devenvRoot !== undefined
    && FileSystem.realpathSync(devenvRoot) === root
}

async function isEnabledForCommonDirectory(record: string, common: string): Promise<boolean> {
  const choice = await readOptionalFile(Path.resolve(record, 'choice'))
  const recordedCommon = await readOptionalFile(Path.resolve(record, 'common-dir'))
  return choice === 'enabled\n' && recordedCommon === `${common}\n`
}

async function isRegisteredWorktree(
  root: string,
  canonicalRoot: string,
  environment: SetupEnvironment,
): Promise<boolean> {
  const worktrees = await environment.run('git', {
    args: ['worktree', 'list', '--porcelain', '-z'],
    cwd: root,
  })
  return worktrees.exitCode === 0
    && worktrees.stdout.split(NullCharacter).includes(`worktree ${canonicalRoot}`)
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
