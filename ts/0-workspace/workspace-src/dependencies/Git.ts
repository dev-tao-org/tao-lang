import { Errors, NewlineCharacter, Regxs, TabCharacter, UserInput } from '@shared'
import { FS } from '@shared/os'
import Exec from '@shared/os/exec'
import type { GitSourceAdapter } from './Types'

/** gitSourceAdapter resolves GitHub refs and checks out exact immutable commits. */
export const gitSourceAdapter: GitSourceAdapter = {
  resolveCommit: resolveGitHubCommit,
  fetchCommit: fetchGitHubCommit,
}

async function resolveGitHubCommit(repository: string, version: string): Promise<string> {
  if (isCommit(version)) {
    return version.toLowerCase()
  }
  const refs = refNames(version)
  const output = await Exec.captureStdout('git', ['ls-remote', repository, ...refs])
  // ex: X\trefs/tags/v1\n -> [[X, refs/tags/v1]]
  const records = output.split(NewlineCharacter).filter(Boolean).map(line => line.split(TabCharacter))
  const commit = refs.map(ref => records.find(record => record[1] === ref)?.[0]).find(Boolean)
  return validateCommit(commit, repository, version)
}

async function fetchGitHubCommit(repository: string, commit: string, destination: string): Promise<void> {
  if (!isCommit(commit)) {
    UserInput.fail(`Invalid immutable Git commit ID ${commit}.`)
  }
  await FS.mkdir(destination)
  await Exec.captureStdout('git', ['init', '--quiet', destination])
  await Exec.captureStdout('git', ['-C', destination, 'fetch', '--quiet', '--depth=1', repository, commit])
  await Exec.captureStdout('git', ['-C', destination, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'])
  const actual = await Exec.captureStdout('git', ['-C', destination, 'rev-parse', 'HEAD'])
  if (actual.toLowerCase() !== commit.toLowerCase()) {
    Errors.ThrowHostEnvironment(`Git fetched ${actual} when Tao requested ${commit}.`)
  }
}

function refNames(version: string): string[] {
  return [`refs/tags/${version}^{}`, `refs/tags/${version}`, `refs/heads/${version}`]
}

type CandidateCommit = string | undefined

function validateCommit(commit: CandidateCommit, repository: string, version: string): string {
  if (!isCommit(commit)) {
    UserInput.fail(`Cannot resolve ${repository} version ${version} to an immutable commit.`)
  }
  return commit.toLowerCase()
}

function isCommit(value: CandidateCommit): value is string {
  return value !== undefined && Regxs.GitCommitHashRegx.test(value)
}
