import Exec from '@shared/os/exec'

type GitOptions = { env?: Record<string, string>; input?: string }
/** captureGit runs literal Git arguments without refreshing the developer's index. */
export async function captureGit(root: string, args: readonly string[], options: GitOptions = {}): Promise<string> {
  const result = await Exec.capture('git', ['--literal-pathspecs', ...args], {
    cwd: root,
    addEnv: createGitEnvironment(options.env),
    stdin: options.input,
  })
  return result.stdout
}

/** resolveCommit requires a full immutable commit identity before a worker changes its own checkout. */
export async function resolveCommit(root: string, ref: string): Promise<string> {
  return (await captureGit(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim()
}

function createGitEnvironment(overrides?: Record<string, string>) {
  return { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', ...overrides }
}
