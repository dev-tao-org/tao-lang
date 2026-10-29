import { Errors } from '@shared'
import { Env, Platform } from '@shared/os'

/** captureGit runs literal Git arguments without refreshing the developer's index. */
export async function captureGit(root: string, args: readonly string[], options: GitOptions = {}): Promise<string> {
  const child = Platform.spawn('git --literal-pathspecs', {
    variadicArgs: args,
    cwd: root,
    env: createGitEnvironment(options.env),
    stdin: options.input === undefined ? 'ignore' : 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (options.input !== undefined && child.stdin) {
    child.stdin.write(options.input)
    child.stdin.end()
  }
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  if (status !== 0) {
    Errors.ThrowCommandExecution({
      command: 'git',
      args: [...args],
      cwd: root,
      status,
      signal: child.signalCode,
      stdout,
      stderr,
    })
  }
  return stdout
}

/** resolveCommit requires a full immutable commit identity before a worker changes its own checkout. */
export async function resolveCommit(root: string, ref: string): Promise<string> {
  return (await captureGit(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim()
}

type GitOptions = { env?: Record<string, string>; input?: string }

function createGitEnvironment(overrides?: Record<string, string>) {
  return { ...Env.snapshot(), GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', ...overrides }
}
