import * as CLIKit from '@cli-kit'
import { Errors, Regxs } from '@shared'
import { Repo } from '@shared/os'
import Exec from '@shared/os/exec'

/** pushBranch publishes one pinned local branch to an explicit non-main destination. */
export async function pushBranch(
  remote: string,
  branch: string,
  options: { source?: string } = {},
): Promise<void> {
  if (branch.toLowerCase() === 'main') {
    Errors.ThrowUserInput('Agent pushes to main are prohibited. Use the separately authorized landing workflow.')
  }
  const source = options.source ?? branch
  assertBareBranch(branch)
  assertBareBranch(source)
  const cwd = Repo.getWorkspaceRoot()
  await Exec.captureStdout('git', ['check-ref-format', `refs/heads/${branch}`], { cwd })
  await Exec.captureStdout('git', ['check-ref-format', `refs/heads/${source}`], { cwd })
  const remoteList = await Exec.captureStdout('git', 'remote', { cwd })
  const remotes = remoteList.trim().split(Regxs.ExtensionLineEndingRegx).filter(Boolean)
  if (!remotes.includes(remote) || remote.startsWith('-')) {
    Errors.ThrowUserInput(`Use a configured remote name, such as origin: ${remote}`)
  }
  const commit = await Exec.captureStdout('git', ['rev-parse', '--verify', `refs/heads/${source}^{commit}`], { cwd })
  await CLIKit.runNonInteractiveCommand('git', [
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
  ], { cwd })
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
