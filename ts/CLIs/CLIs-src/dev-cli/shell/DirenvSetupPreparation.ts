import { Errors, NewlineCharacter, NullCharacter, Regxs, Try } from '@shared'
import { Env, FS, Path } from '@shared/os'
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
        `Development shell preparation was unavailable; directory entry will retry normally.${NewlineCharacter}${
          errorMessage(cause)
        }`,
      )
    },
  })
}

async function shouldPrepareEnvironment(environment: SetupEnvironment): Promise<boolean> {
  if (!FS.existsSync(Path.home.taoDev('shell', 'repositories'))) {
    return false
  }
  const root = environment.root()
  const canonicalRoot = FS.realpathSync(root)
  if (isAlreadyInDevenv(canonicalRoot)) {
    return false
  }
  if (!FS.existsSync(Path.resolve(root, 'devenv.nix'))) {
    return false
  }
  const git = await environment.run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root })
  if (git.status !== 0) {
    return false
  }
  const common = FS.realpathSync(git.stdout.trim())
  const hash = await environment.run('git', ['hash-object', '--stdin'], {
    cwd: root,
    stdin: `${common}${NewlineCharacter}`,
  })
  if (hash.status !== 0 || !Regxs.LowercaseHashRangeRegx.test(hash.stdout.trim())) {
    return false
  }
  const record = Path.home.taoDev('shell', 'repositories', hash.stdout.trim())
  if (!await isEnabledForCommonDirectory(record, common)) {
    return false
  }
  return await isRegisteredWorktree(root, canonicalRoot, environment)
}

function isAlreadyInDevenv(root: string): boolean {
  const devenvRoot = Env.get('DEVENV_ROOT')
  return Env.get('TAO_DEVENV') === '1' && devenvRoot !== undefined
    && FS.realpathSync(devenvRoot) === root
}

async function isEnabledForCommonDirectory(record: string, common: string): Promise<boolean> {
  const choice = await readOptionalFile(Path.resolve(record, 'choice'))
  const recordedCommon = await readOptionalFile(Path.resolve(record, 'common-dir'))
  return choice === ('enabled' + NewlineCharacter) && recordedCommon === `${common}${NewlineCharacter}`
}

async function isRegisteredWorktree(
  root: string,
  canonicalRoot: string,
  environment: SetupEnvironment,
): Promise<boolean> {
  const worktrees = await environment.run('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: root })
  return worktrees.status === 0
    && worktrees.stdout.split(NullCharacter).includes(`worktree ${canonicalRoot}`)
}

async function runDevenvShellPrepare(environment: SetupEnvironment): Promise<void> {
  const { run, write } = environment
  const root = environment.root()
  write('Preparing this checkout’s development shell for automatic directory entry...')
  const prepared = await run('devenv', ['shell', '--no-tui', '--', 'true'], {
    cwd: root,
    addEnv: { DEVENV_TUI: 'false' },
    timeoutMs: 60_000,
  })
  if (prepared.status !== 0) {
    write(
      `Development shell preparation was unavailable (exit ${prepared.status}); directory entry will retry normally.${NewlineCharacter}${prepared.stderr.trim()}`,
    )
  }
}

function errorMessage(cause: unknown): string {
  return Errors.isNativeError(cause) ? cause.message : String(cause)
}
