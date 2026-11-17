import { Regxs, UserInput } from '@shared'
import { git, type LandingIO } from './LandingIO'
import { requireOwnedStorageChanges } from './StorageStatus'

/** requireCleanBranch rejects detached, non-feature and dirty authored checkouts before mutation. */
export async function requireCleanBranch(io: LandingIO): Promise<string> {
  await git(io, ['worktree', 'list', '--porcelain'])
  const branch = await git(io, ['branch', '--show-current'])
  requireFeatureBranch(branch)
  await requireClean(io)
  return branch
}

/** requireFeatureBranch validates a literal feature branch before using it in refspecs or paths. */
export function requireFeatureBranch(branch: string): void {
  UserInput.Require(
    !(!Regxs.FeatureBranchNameRegx.test(branch) || branch.includes('..') || branch.endsWith('/')),
    'Landing requires a named feat/<name> branch.',
  )
}

/** requireClean includes untracked files and the storage worktree despite ignore-all gitlink settings. */
export async function requireClean(io: LandingIO): Promise<void> {
  UserInput.Require(
    !(await git(io, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=all'])),
    'Commit or preserve authored changes before running the landing workflow.',
  )
  const module = await git(io, ['submodule', 'status', '--', '.storage'])
  if (!module.startsWith('-') && module) {
    await requireOwnedStorageChanges(io)
  }
}

/** integrateMain fetches and merges main without publishing; conflicts remain available for normal recovery. */
export async function integrateMain(io: LandingIO): Promise<boolean> {
  await requireCleanBranch(io)
  const before = await git(io, ['rev-parse', 'HEAD'])
  await git(io, ['fetch', 'origin', 'main'])
  await git(io, ['merge', '--no-edit', 'refs/remotes/origin/main'])
  return before !== await git(io, ['rev-parse', 'HEAD'])
}
