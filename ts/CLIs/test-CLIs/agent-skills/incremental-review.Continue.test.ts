import { Errors, NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path } from '@shared/os'
import { runReview } from '../../CLIs-src/agent-skills/incremental-review/incremental-review'
import { acceptSelection } from '../../CLIs-src/agent-skills/incremental-review/ReviewAccept'
import { git, head, readJson, resolveGitIndexPath } from '../../CLIs-src/agent-skills/incremental-review/ReviewGit'
import { planSelection } from '../../CLIs-src/agent-skills/incremental-review/ReviewPlan'
import { loadSession, saveSession } from '../../CLIs-src/agent-skills/incremental-review/ReviewSession'
import type * as ReviewTypes from '../../CLIs-src/agent-skills/incremental-review/ReviewTypes'
import { put, read, withFixture } from './incremental-review.test-fixtures.Review'

Tests.test('continuation inherits acceptance and evidence while reopening uses the original baseline', async () => {
  await withFixture(
    { content: 'original' + NewlineCharacter, other: 'original' + NewlineCharacter },
    async ({ root, session }) => {
      await put(root, 'content', 'accepted' + NewlineCharacter)
      await acceptSelection(session, await planSelection(session, ['content']))
      session.recheck = ['other']
      session.notes = ['Retain this concern']
      await saveSession(session)
      await put(root, '.artifacts/notes/incremental-review/progress.json', '{"completed":1}' + NewlineCharacter)
      await put(root, '.artifacts/notes/incremental-review/current-group.md', 'Current group' + NewlineCharacter)
      const next = Path.join(root, '.artifacts/next')
      await git(root, ['worktree', 'add', '-b', 'feat/next', next, 'HEAD'])
      await put(root, 'content', 'old pending edit' + NewlineCharacter)
      await put(root, 'other', 'old staged edit' + NewlineCharacter)
      await git(root, ['add', 'other'])
      await put(next, 'content', 'new pending edit' + NewlineCharacter)
      const before = await captureOldState(root, session.reviewedRoot)
      const args = ['continue', '--repo', next, '--from', root, '--branch', 'feat/next-incremental-review-approved']
      await runReview(args)
      const continued = await loadSession(next)
      Tests.expect(continued.id).not.toBe(session.id)
      Tests.expect(continued.accepted).toEqual(session.accepted)
      Tests.expect(continued.recheck).toEqual(session.recheck)
      Tests.expect(continued.notes).toEqual(session.notes)
      Tests.expect((await readReviewStatus(next)).recheck).toEqual(['other', 'content'])
      Tests.expect(continued.baseCommit).toBe(session.baseCommit)
      Tests.expect(continued.base).toBe(session.base)
      Tests.expect(await head(continued.reviewedRoot)).toBe(before.reviewedHead)
      Tests.expect(await read(continued.reviewedRoot, 'content')).toBe('accepted\n')
      Tests.expect(await read(next, '.artifacts/notes/incremental-review/progress.json')).toBe('{"completed":1}\n')
      Tests.expect(await FS.exists(Path.join(continued.directory, 'journal.json'))).toBe(false)
      Tests.expect(await FS.exists(Path.join(continued.directory, 'evidence/previous/session.json'))).toBe(true)
      await Tests.expect(() => runReview(args)).toThrow('already exists')
      await runReview(['reopen', '--repo', next, '--files', 'content'])
      Tests.expect(await read(continued.reviewedRoot, 'content')).toBe('original\n')
      Tests.expect(await read(next, 'content')).toBe('new pending edit\n')
      Tests.expect(await captureOldState(root, session.reviewedRoot)).toEqual(before)
    },
  )
})

Tests.test('an existing destination branch refuses before installing continuation history', async () => {
  await withFixture({ content: 'original' + NewlineCharacter }, async ({ root, session }) => {
    const next = Path.join(root, '.artifacts/next')
    await git(root, ['worktree', 'add', '-b', 'feat/next', next, 'HEAD'])
    const branch = 'feat/next-incremental-review-approved'
    await git(root, ['branch', branch])
    await put(root, '.artifacts/notes/incremental-review/progress.json', '{"completed":1}' + NewlineCharacter)
    await Tests.expect(() => runReview(['continue', '--repo', next, '--from', root, '--branch', branch]))
      .toThrow('branch already exists')
    const state = Path.join(next, '.artifacts/notes/incremental-review')
    Tests.expect(await FS.exists(Path.join(state, 'progress.json'))).toBe(false)
    Tests.expect(await FS.readdir(Path.join(state, 'active'))).toEqual(['operation.lock'])
    await git(next, ['switch', '-c', 'feat/retry'])
    await runReview(['continue', '--repo', next, '--from', root, '--branch', 'feat/retry-incremental-review-approved'])
    Tests.expect(await head((await loadSession(next)).reviewedRoot)).toBe(await head(session.reviewedRoot))
  })
})

Tests.test('continuation refuses interrupted and foreign source sessions before creating a branch', async () => {
  await withFixture(
    { content: 'original' + NewlineCharacter, other: 'original' + NewlineCharacter },
    async ({ root, session }) => {
      await put(root, 'content', 'accepted' + NewlineCharacter)
      await put(root, 'other', 'staged' + NewlineCharacter)
      await git(root, ['add', 'other'])
      await put(root, 'other', 'unstaged' + NewlineCharacter)
      const next = Path.join(root, '.artifacts/next')
      await git(root, ['worktree', 'add', '-b', 'feat/next', next, 'HEAD'])
      const blocker = await interruptAcceptance(session)
      const args = ['continue', '--repo', next, '--from', root, '--branch', 'feat/next-incremental-review-approved']
      const beforeRefusal = await captureOldState(root, session.reviewedRoot)
      await Tests.expect(() => runReview(args)).toThrow('interrupted acceptance')
      Tests.expect(await captureOldState(root, session.reviewedRoot)).toEqual(beforeRefusal)
      Tests.expect((await git(root, ['branch', '--list', 'feat/next-incremental-review-approved'])).trim()).toBe('')
      await recoverInterruption(session, blocker)
      session.id = 'foreign'
      await saveSession(session)
      await Tests.expect(() => runReview(args)).toThrow('ownership')
      Tests.expect((await git(root, ['branch', '--list', 'feat/next-incremental-review-approved'])).trim()).toBe('')
    },
  )
})

async function recoverInterruption(session: ReviewTypes.ReviewSession, blocker: string): Promise<void> {
  const indexPath = await resolveGitIndexPath(session.root)
  const interruptedIndex = await FS.readFile(indexPath)
  await FS.rm(blocker)
  await runReview(['recover', '--repo', session.root])
  const journal = await readJson<ReviewTypes.ReviewJournal>(Path.join(session.directory, 'journal.json'))
  Tests.expect(journal.phase).toBe('complete')
  Tests.expect(await read(session.reviewedRoot, 'content')).toBe('accepted\n')
  Tests.expect(await read(session.root, 'content')).toBe('accepted\n')
  Tests.expect(await git(session.root, ['show', ':other'])).toBe('staged\n')
  Tests.expect(await read(session.root, 'other')).toBe('unstaged\n')
  Tests.expect(await FS.readFile(indexPath)).toEqual(interruptedIndex)
  Tests.expect((await loadSession(session.root)).accepted).toHaveProperty('content')
  const beforeRetry = await captureOldState(session.root, session.reviewedRoot)
  await runReview(['recover', '--repo', session.root])
  Tests.expect(await captureOldState(session.root, session.reviewedRoot)).toEqual(beforeRetry)
}

async function interruptAcceptance(session: ReviewTypes.ReviewSession): Promise<string> {
  const selection = await planSelection(session, ['content'])
  const blocker = Path.join(session.directory, 'receipts')
  const token = 'Fixture blocks receipt directory creation'
  await FS.writeFile(blocker, token, { flag: 'wx' })
  await Tests.expect(() => acceptSelection(session, selection)).toThrow()
  Tests.expect(await FS.readFile(blocker, 'utf8')).toBe(token)
  const journal = await readJson<ReviewTypes.ReviewJournal>(Path.join(session.directory, 'journal.json'))
  Tests.expect(journal.phase).toBe('reviewed')
  Tests.expect(await head(session.root)).toBe(journal.sourceCommit)
  Tests.expect(await head(session.reviewedRoot)).toBe(journal.reviewedCommit)
  Tests.expect(await git(session.root, ['show', ':other'])).toBe('staged\n')
  Tests.expect(await read(session.root, 'other')).toBe('unstaged\n')
  return blocker
}

async function captureOldState(root: string, reviewedRoot: string) {
  return {
    sourceHead: await head(root),
    reviewedHead: await head(reviewedRoot),
    index: await FS.readFile(await resolveGitIndexPath(root)),
    content: await read(root, 'content'),
    other: await read(root, 'other'),
    session: await read(root, '.artifacts/notes/incremental-review/active/session.json'),
  }
}

async function readReviewStatus(root: string): Promise<ReviewTypes.ReviewStatus> {
  const result = await runReview(['status', '--repo', root])
  if (!isReviewStatus(result)) {
    Errors.ThrowShouldNeverHappen('Incremental review status returned a different command result.')
  }
  return result
}

function isReviewStatus(result: ReviewTypes.IncrementalReviewResult): result is ReviewTypes.ReviewStatus {
  return 'recheck' in result && 'pending' in result
}
