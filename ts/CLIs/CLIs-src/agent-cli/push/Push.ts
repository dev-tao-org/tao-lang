import { runCommand } from '@cli-kit'
import { Errors, Regxs } from '@shared'
import { Platform, Repo } from '@shared/os'

/** PushIO isolates guarded Git reads and the single publication operation. */
export type PushIO = {
  capture: (args: readonly string[]) => Promise<string>
  run: (args: readonly string[]) => Promise<void>
}

/** pushBranch publishes one pinned local branch to an explicit non-main destination. */
export async function pushBranch(
  remote: string,
  branch: string,
  options: { source?: string } = {},
  io = createPushIO(),
): Promise<void> {
  if (branch.toLowerCase() === 'main') {
    Errors.ThrowUserInput('Agent pushes to main are prohibited. Use the separately authorized landing workflow.')
  }
  const source = options.source ?? branch
  assertBareBranch(branch)
  assertBareBranch(source)
  await io.capture(['check-ref-format', `refs/heads/${branch}`])
  await io.capture(['check-ref-format', `refs/heads/${source}`])
  const remotes = (await io.capture(['remote'])).trim().split(Regxs.ExtensionLineEndingRegx).filter(Boolean)
  if (!remotes.includes(remote) || remote.startsWith('-')) {
    Errors.ThrowUserInput(`Use a configured remote name, such as origin: ${remote}`)
  }
  const commit = (await io.capture(['rev-parse', '--verify', `refs/heads/${source}^{commit}`])).trim()
  await io.run([
    '-c',
    `remote.${remote}.mirror=false`,
    '-c',
    'push.followTags=false',
    'push',
    '--no-follow-tags',
    '--recurse-submodules=no',
    '--',
    remote,
    `${commit}:refs/heads/${branch}`,
  ])
}

function createPushIO(): PushIO {
  const cwd = Repo.getWorkspaceRoot()
  return {
    capture: args => Platform.capture('git', { variadicArgs: args, cwd }),
    run: args => runCommand('git', { variadicArgs: args, cwd }),
  }
}

function assertBareBranch(branch: string): void {
  if (isRefspecOrOption(branch)) {
    Errors.ThrowUserInput(`Name a local branch without options, force prefixes or refspecs: ${branch}`)
  }
}

function isRefspecOrOption(branch: string): boolean {
  const startsWithGitOption = branch.startsWith('-') || branch.startsWith('+')
  const startsWithFullRef = branch.startsWith('refs/')
  const hasPrefix = startsWithGitOption || startsWithFullRef
  return !branch || hasPrefix || branch.includes(':')
}
