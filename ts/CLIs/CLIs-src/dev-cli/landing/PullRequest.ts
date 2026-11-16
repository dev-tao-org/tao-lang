import { Errors, Json, NewlineCharacter } from '@shared'
import { requireFeatureBranch } from './Integration'
import { git, type LandingIO } from './LandingIO'
import { requireSourceHead } from './SourceIdentity'

/** LandingProof retains GitHub's merged identity plus the authoritative main ancestry confirmation. */
export type LandingProof = { branch: string; url: string; sourceCommit: string; mergeCommit: string; mergedAt: string }

/** inspectLanding distinguishes a successful unmerged lookup from unavailable or contradictory remote evidence. */
export async function inspectLanding(io: LandingIO, branch: string): Promise<LandingProof | undefined> {
  requireFeatureBranch(branch)
  const prs = await listPullRequests(io, branch, 'merged')
  const pr = prs[0]
  if (!pr) {
    return undefined
  }
  const { mergedAt, mergeCommit } = pr
  if (!mergedAt || !mergeCommit?.oid || !matchesExpectedBranches(pr, branch)) {
    Errors.ThrowHostEnvironment(`GitHub returned incomplete or contradictory merge evidence for ${branch}.`)
  }
  const comparison = parseCommitComparison(
    await io.command('gh', [
      'api',
      `repos/{owner}/{repo}/compare/${mergeCommit.oid}...main`,
    ]),
  )
  if (comparison.status !== 'ahead' && comparison.status !== 'identical') {
    Errors.ThrowHostEnvironment('The merged pull request commit is not confirmed on remote main.')
  }
  return {
    branch,
    url: pr.url,
    sourceCommit: pr.headRefOid,
    mergeCommit: mergeCommit.oid,
    mergedAt,
  }
}

/** publishAndMerge opens or updates one PR, waits for current-head checks and requests an exact-head squash. */
export async function publishAndMerge(
  io: LandingIO,
  branch: string,
  message: string,
  head: string,
): Promise<LandingProof> {
  await requireSourceHead(io, head)
  await git(io, ['push', 'origin', `${head}:refs/heads/${branch}`])
  const { pr, title, bodyPath } = await reviewedPullRequest(io, branch, message)
  requirePullRequestHead(pr, head)
  await io.command('gh', ['pr', 'checks', pr.url, '--required', '--watch', '--fail-fast'])
  requirePullRequestHead((await listPullRequests(io, branch, 'open'))[0], head)
  if (await git(io, ['rev-parse', 'HEAD']) !== head) {
    Errors.ThrowUserInput('The local branch changed while checks were running; rerun land.')
  }
  await io.command('gh', [
    'pr',
    'merge',
    pr.url,
    '--squash',
    '--match-head-commit',
    head,
    '--subject',
    title,
    '--body-file',
    bodyPath,
  ])
  const proof = await proveLanded(io, branch)
  if (proof.sourceCommit !== head) {
    Errors.ThrowHostEnvironment('GitHub did not confirm the requested source commit as merged.')
  }
  return proof
}

function matchesExpectedBranches(pr: PullRequest, branch: string): boolean {
  return pr.baseRefName === 'main' && pr.headRefName === branch
}

async function proveLanded(io: LandingIO, branch: string): Promise<LandingProof> {
  const proof = await inspectLanding(io, branch)
  if (!proof) {
    Errors.ThrowUserInput(`No authoritative merged pull request was found for ${branch}.`)
  }
  return proof
}

type PullRequest = {
  url: string
  headRefOid: string
  headRefName: string
  baseRefName: string
  isCrossRepository: boolean
  mergedAt: NullableMergeTime
  mergeCommit: NullableMergeCommit
}

async function reviewedPullRequest(io: LandingIO, branch: string, message: string) {
  const existing = await listPullRequests(io, branch, 'open')
  const title = message.split(NewlineCharacter)[0]
  const bodyPath = `.artifacts/merge/${branch}.body`
  await io.write(bodyPath, message.split(NewlineCharacter).slice(2).join(NewlineCharacter))
  if (existing.length > 1) {
    Errors.ThrowUserInput('More than one open pull request matches this branch.')
  }
  await io.command('gh', [
    'pr',
    existing.length ? 'edit' : 'create',
    ...existing.length ? [existing[0].url] : ['--base', 'main', '--head', branch],
    '--title',
    title,
    '--body-file',
    bodyPath,
  ])
  return { pr: (await listPullRequests(io, branch, 'open'))[0], title, bodyPath }
}

async function listPullRequests(io: LandingIO, branch: string, state: string): Promise<PullRequest[]> {
  const prs = parsePullRequests(
    await io.command('gh', [
      'pr',
      'list',
      '--head',
      branch,
      '--base',
      'main',
      '--state',
      state,
      '--limit',
      '100',
      '--json',
      'url,headRefOid,headRefName,baseRefName,mergedAt,mergeCommit,isCrossRepository',
    ]),
  )
  if (prs.some(pr => typeof pr.isCrossRepository !== 'boolean')) {
    Errors.ThrowHostEnvironment('GitHub did not identify the pull request source repository.')
  }
  return prs.filter(pr => !pr.isCrossRepository)
}

type OptionalPullRequest = PullRequest | undefined
function requirePullRequestHead(pr: OptionalPullRequest, head: string): asserts pr is PullRequest {
  if (!pr || pr.headRefOid !== head || pr.baseRefName !== 'main') {
    Errors.ThrowHostEnvironment('The pull request does not describe the exact current source head.')
  }
}

type NullableMergeTime = string | null
type NullableMergeCommit = { oid: string } | null

type CommitComparison = { status?: string }

function parseCommitComparison(contents: string): CommitComparison {
  return Json.Parse(contents) as CommitComparison
}

function parsePullRequests(contents: string): PullRequest[] {
  return Json.Parse(contents) as PullRequest[]
}
