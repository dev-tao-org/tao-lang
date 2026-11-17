import { Lists, NullCharacter, Try, UserInput } from '@shared'
import { FileLock, FS, Path, Platform } from '@shared/os'
import { assertSupportedTransforms, git, head, readJson, snapshot, tree, writeJson } from './ReviewGit'
import type { ReviewJournal, ReviewSession, ReviewStatus } from './ReviewTypes'

/** withReviewLock serializes operations without leaving stale locks after interruption. */
export async function withReviewLock<Value>(root: string, action: () => Promise<Value>): Promise<Value> {
  const directory = sessionDirectory(root)
  await FS.mkdir(directory)
  const lock = await FileLock.tryAcquire(Path.join(directory, 'operation.lock'))
  UserInput.require(!!lock, 'Another incremental review operation owns this session.')
  return await Try(action, { finally: () => lock.release() })
}

/** startReview creates a reviewed branch and a separately owned checkout from the supplied base. */
export async function startReview(
  root: string,
  base: string,
  branch: string,
  worktree?: string,
): Promise<ReviewSession> {
  const directory = sessionDirectory(root)
  const statePath = Path.join(directory, 'session.json')
  if (await FS.exists(statePath)) {
    const existing = await loadSession(root)
    const existingSessionDiffers = existing.reviewedBranch !== branch || existing.base !== base
    const requestedWorktreeDiffers = Boolean(worktree && existing.reviewedRoot !== Path.resolve(worktree))
    UserInput.require(
      !(existingSessionDiffers || requestedWorktreeDiffers),
      'A different review session already exists. Resume it using its recorded branch and base.',
    )
    await assertOwnedSession(existing)
    return existing
  }
  const baseCommit = await head(root, `${base}^{commit}`)
  const session = await prepareReview(root, base, baseCommit, branch, worktree)
  await createReview(session, baseCommit)
  return session
}

/** prepareReview validates a fresh destination and assigns its independent ownership identity. */
export async function prepareReview(
  root: string,
  base: string,
  baseCommit: string,
  branch: string,
  worktree?: string,
): Promise<ReviewSession> {
  const directory = sessionDirectory(root)
  UserInput.require(
    !(await FS.exists(Path.join(directory, 'session.json'))),
    'A review session already exists in the destination checkout.',
  )
  const sourceBranch = (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  if (!sourceBranch.startsWith('feat/') || branch !== `${sourceBranch}-incremental-review-approved`) {
    UserInput.fail(`Use the approved-content branch ${sourceBranch}-incremental-review-approved.`)
  }
  if ((await git(root, ['branch', '--list', branch])).trim()) {
    UserInput.fail(`Approved-content branch already exists: ${branch}`)
  }
  const reviewedRoot = Path.resolve(worktree ?? Path.join(directory, 'reviewed'))
  if (await FS.exists(reviewedRoot)) {
    UserInput.fail(`Reviewed worktree destination already exists: ${reviewedRoot}`)
  }
  return {
    version: 1,
    id: Platform.randomUUID(),
    root,
    sourceBranch,
    reviewedBranch: branch,
    reviewedRoot,
    base,
    baseCommit,
    directory,
    accepted: {},
    recheck: [],
    notes: [],
  }
}

/** createReview creates the owned checkout at an explicitly pinned accepted commit. */
export async function createReview(session: ReviewSession, acceptedCommit: string): Promise<void> {
  await git(session.root, ['worktree', 'add', '-b', session.reviewedBranch, session.reviewedRoot, acceptedCommit])
  await writeJson(await resolveReviewOwnerPath(session.reviewedRoot), { id: session.id, root: session.root })
  await saveSession(session)
}

/** loadSession verifies that retained state belongs to this implementation checkout. */
export async function loadSession(root: string): Promise<ReviewSession> {
  const path = Path.join(sessionDirectory(root), 'session.json')
  UserInput.require(
    !!(await FS.exists(path)),
    'No incremental review session exists. Run start --base main --branch feat/<topic>-incremental-review-approved first.',
  )
  const session = await readJson<ReviewSession>(path)
  UserInput.require(
    !(session.version !== 1 || session.root !== root || session.directory !== sessionDirectory(root)),
    'Review session state belongs to a different checkout or unsupported format.',
  )
  return session
}

/** saveSession persists review notes and recheck state. */
export async function saveSession(session: ReviewSession): Promise<void> {
  await writeJson(Path.join(session.directory, 'session.json'), session)
}

/** renameReviewBranch renames only the owned approved branch and retains its session identity and content. */
export async function renameReviewBranch(session: ReviewSession, branch: string): Promise<void> {
  await requireIdleSession(session)
  if (branch !== `${session.sourceBranch}-incremental-review-approved`) {
    UserInput.fail(`Use the approved-content branch ${session.sourceBranch}-incremental-review-approved.`)
  }
  const actual = (await git(session.reviewedRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  UserInput.require(
    !(actual !== session.reviewedBranch && actual !== branch),
    'The approved checkout changed branches; preserve it and resolve ownership first.',
  )
  await assertOwnedSession({ ...session, reviewedBranch: actual })
  if (actual !== branch) {
    await git(session.reviewedRoot, ['branch', '-m', branch])
  }
  session.reviewedBranch = branch
  await saveSession(session)
}

/** requireIdleSession refuses to replace a transaction interrupted between source and reviewed updates. */
export async function requireIdleSession(session: ReviewSession): Promise<void> {
  const path = Path.join(session.directory, 'journal.json')
  UserInput.require(
    !(await FS.exists(path) && (await readJson<ReviewJournal>(path)).phase !== 'complete'),
    'An interrupted acceptance is pending. Run recover before planning another selection.',
  )
}

/** assertOwnedSession refuses foreign, moved or dirty reviewed checkouts. */
export async function assertOwnedSession(session: ReviewSession): Promise<void> {
  const source = (await git(session.root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  const reviewed = (await git(session.reviewedRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  const owner = await readJson<{ id: string; root: string }>(await resolveReviewOwnerPath(session.reviewedRoot))
  const branchChanged = source !== session.sourceBranch || reviewed !== session.reviewedBranch
  const ownershipChanged = owner.id !== session.id || owner.root !== session.root
  UserInput.require(
    !(branchChanged || ownershipChanged),
    'Review checkout ownership or branch identity changed; resume the recorded checkouts first.',
  )
  const sourceGit = (await git(session.root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()
  const reviewedGit = (await git(session.reviewedRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
    .trim()
  UserInput.require(
    sourceGit === reviewedGit,
    'The reviewed checkout no longer belongs to the implementation repository.',
  )
}

/** requireCleanReviewed refuses any foreign tracked or untracked work in the reviewed checkout. */
export async function requireCleanReviewed(session: ReviewSession): Promise<void> {
  await assertSupportedTransforms(
    session.reviewedRoot,
    (await git(session.reviewedRoot, ['ls-files', '-z'])).split(NullCharacter).filter(Boolean),
  )
  if ((await git(session.reviewedRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).trim()) {
    UserInput.fail(`Reviewed checkout contains unapproved work: ${session.reviewedRoot}`)
  }
}

/** reviewStatus compares reviewed content directly with the implementation's saved working snapshot. */
export async function reviewStatus(session: ReviewSession): Promise<ReviewStatus> {
  await assertOwnedSession(session)
  const sourceHead = await head(session.root)
  const reviewedHead = await head(session.reviewedRoot)
  const diskTree = await snapshot(session.root, session.directory, sourceHead)
  const pending = await git(session.root, ['diff', '--name-status', '--no-renames', reviewedHead, diskTree])
  const recheck = await changedAcceptedPaths(session, diskTree)
  const journalPath = Path.join(session.directory, 'journal.json')
  const journal = await FS.exists(journalPath) ? await readJson<ReviewJournal>(journalPath) : undefined
  return {
    sourceBranch: session.sourceBranch,
    sourceHead,
    reviewedBranch: session.reviewedBranch,
    reviewedHead,
    reviewedRoot: session.reviewedRoot,
    pending,
    recheck: Lists.unique(session.recheck, recheck),
    notes: session.notes,
    journal: journal?.phase,
    outline: await git(session.root, ['diff', '--stat', reviewedHead, diskTree]),
    comparison: `git diff ${reviewedHead} ${diskTree}`,
    gitLens:
      'Compare the reviewed branch with the implementation Working Tree, including uncommitted changes; a branch-only comparison omits them.',
  }
}

/** assertReviewedSnapshot accepts only the journal's old or prepared clean tree during recovery. */
export async function assertReviewedSnapshot(session: ReviewSession, journal: ReviewJournal): Promise<void> {
  await assertSupportedTransforms(
    session.reviewedRoot,
    (await git(session.reviewedRoot, ['ls-files', '-z'])).split(NullCharacter).filter(Boolean),
  )
  const index = await tree(session.reviewedRoot)
  const before = await head(session.root, `${journal.selection.reviewedHead}^{tree}`)
  const allowed = [before, journal.selection.reviewedTree]
  UserInput.require(
    !(!allowed.includes(index) || (await git(session.reviewedRoot, ['diff-files', '--name-only'])).trim()),
    'Reviewed checkout changed during acceptance; preserve it and resolve ownership before recovery.',
  )
  UserInput.require(
    !(await git(session.reviewedRoot, ['ls-files', '--others', '--exclude-standard', '-z'])).length,
    'Reviewed checkout has untracked work; move it aside explicitly before recovery.',
  )
}

async function resolveReviewOwnerPath(root: string): Promise<string> {
  return (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'incremental-review-owner.json']))
    .trim()
}

async function changedAcceptedPaths(session: ReviewSession, diskTree: string): Promise<string[]> {
  const result: string[] = []
  for (const [path, accepted] of Object.entries(session.accepted)) {
    if ((await git(session.root, ['ls-tree', '-z', diskTree, '--', path])) !== accepted) {
      result.push(path)
    }
  }
  return result
}

function sessionDirectory(root: string): string {
  return Path.join(root, '.artifacts/notes/incremental-review/active')
}
