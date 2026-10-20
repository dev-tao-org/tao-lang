import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform, SessionLock } from '@shared/os'
import { assertSupportedTransforms, git, head, readJson, snapshot, tree, writeJson } from './ReviewGit'
import type { ReviewJournal, ReviewSession } from './ReviewTypes'

/** sessionDirectory locates retained state in the implementation checkout. */
export function sessionDirectory(root: string): string {
  return Path.join(root, '.artifacts/notes/incremental-review/active')
}

/** withReviewLock serializes operations without leaving stale locks after interruption. */
export async function withReviewLock<Value>(root: string, action: () => Promise<Value>): Promise<Value> {
  const directory = sessionDirectory(root)
  await FileSystem.mkdir(directory, { recursive: true })
  const lock = await SessionLock.acquire(Path.join(directory, 'operation.lock'))
  if (!lock) {
    Errors.ThrowUserInput('Another incremental review operation owns this session.')
  }
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
  if (await FileSystem.exists(statePath)) {
    const existing = await loadSession(root)
    if (
      existing.reviewedBranch !== branch || existing.base !== base
      || (worktree && existing.reviewedRoot !== Path.resolve(worktree))
    ) {
      Errors.ThrowUserInput('A different review session already exists. Resume it using its recorded branch and base.')
    }
    await assertOwnedSession(existing)
    return existing
  }
  const sourceBranch = (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  if (!branch.startsWith('feat/') || branch === sourceBranch) {
    Errors.ThrowUserInput('Use a new feat/ reviewed branch distinct from the implementation branch.')
  }
  const baseCommit = await head(root, `${base}^{commit}`)
  const reviewedRoot = Path.resolve(worktree ?? Path.join(directory, 'reviewed'))
  if (await FileSystem.exists(reviewedRoot)) {
    Errors.ThrowUserInput(`Reviewed worktree destination already exists: ${reviewedRoot}`)
  }
  const session: ReviewSession = {
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
  await git(root, ['worktree', 'add', '-b', branch, reviewedRoot, baseCommit])
  await writeJson(await ownerPath(reviewedRoot), { id: session.id, root })
  await writeJson(statePath, session)
  return session
}

/** loadSession verifies that retained state belongs to this implementation checkout. */
export async function loadSession(root: string): Promise<ReviewSession> {
  const path = Path.join(sessionDirectory(root), 'session.json')
  if (!await FileSystem.exists(path)) {
    Errors.ThrowUserInput(
      'No incremental review session exists. Run start --base main --branch feat/reviewed-name first.',
    )
  }
  const session = await readJson<ReviewSession>(path)
  if (session.version !== 1 || session.root !== root || session.directory !== sessionDirectory(root)) {
    Errors.ThrowUserInput('Review session state belongs to a different checkout or unsupported format.')
  }
  return session
}

/** saveSession persists review notes and recheck state. */
export async function saveSession(session: ReviewSession): Promise<void> {
  await writeJson(Path.join(session.directory, 'session.json'), session)
}

/** requireIdleSession refuses to replace a transaction interrupted between source and reviewed updates. */
export async function requireIdleSession(session: ReviewSession): Promise<void> {
  const path = Path.join(session.directory, 'journal.json')
  if (await FileSystem.exists(path) && (await readJson<ReviewJournal>(path)).phase !== 'complete') {
    Errors.ThrowUserInput('An interrupted acceptance is pending. Run recover before planning another selection.')
  }
}

/** assertOwnedSession refuses foreign, moved or dirty reviewed checkouts. */
export async function assertOwnedSession(session: ReviewSession): Promise<void> {
  const source = (await git(session.root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  const reviewed = (await git(session.reviewedRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  const owner = await readJson<{ id: string; root: string }>(await ownerPath(session.reviewedRoot))
  if (
    source !== session.sourceBranch || reviewed !== session.reviewedBranch || owner.id !== session.id
    || owner.root !== session.root
  ) {
    Errors.ThrowUserInput('Review checkout ownership or branch identity changed; resume the recorded checkouts first.')
  }
  const sourceGit = (await git(session.root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()
  const reviewedGit = (await git(session.reviewedRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
    .trim()
  if (sourceGit !== reviewedGit) {
    Errors.ThrowUserInput('The reviewed checkout no longer belongs to the implementation repository.')
  }
}

/** requireCleanReviewed refuses any foreign tracked or untracked work in the reviewed checkout. */
export async function requireCleanReviewed(session: ReviewSession): Promise<void> {
  await assertSupportedTransforms(
    session.reviewedRoot,
    (await git(session.reviewedRoot, ['ls-files', '-z'])).split('\0').filter(Boolean),
  )
  if ((await git(session.reviewedRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).trim()) {
    Errors.ThrowUserInput(`Reviewed checkout contains unapproved work: ${session.reviewedRoot}`)
  }
}

/** reviewStatus compares reviewed content directly with the implementation's saved working snapshot. */
export async function reviewStatus(session: ReviewSession): Promise<Record<string, unknown>> {
  await assertOwnedSession(session)
  const sourceHead = await head(session.root)
  const reviewedHead = await head(session.reviewedRoot)
  const diskTree = await snapshot(session.root, session.directory, sourceHead)
  const pending = await git(session.root, ['diff', '--name-status', '--no-renames', reviewedHead, diskTree])
  const recheck = await changedAcceptedPaths(session, diskTree)
  const journalPath = Path.join(session.directory, 'journal.json')
  const journal = await FileSystem.exists(journalPath) ? await readJson<ReviewJournal>(journalPath) : undefined
  return {
    sourceBranch: session.sourceBranch,
    sourceHead,
    reviewedBranch: session.reviewedBranch,
    reviewedHead,
    reviewedRoot: session.reviewedRoot,
    pending,
    recheck: [...new Set([...session.recheck, ...recheck])],
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
    (await git(session.reviewedRoot, ['ls-files', '-z'])).split('\0').filter(Boolean),
  )
  const index = await tree(session.reviewedRoot)
  const before = await head(session.root, `${journal.selection.reviewedHead}^{tree}`)
  const allowed = [before, journal.selection.reviewedTree]
  if (!allowed.includes(index) || (await git(session.reviewedRoot, ['diff-files', '--name-only'])).trim()) {
    Errors.ThrowUserInput(
      'Reviewed checkout changed during acceptance; preserve it and resolve ownership before recovery.',
    )
  }
  if ((await git(session.reviewedRoot, ['ls-files', '--others', '--exclude-standard', '-z'])).length) {
    Errors.ThrowUserInput('Reviewed checkout has untracked work; move it aside explicitly before recovery.')
  }
}

async function ownerPath(root: string): Promise<string> {
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
