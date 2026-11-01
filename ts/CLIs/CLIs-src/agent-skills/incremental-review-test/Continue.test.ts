import { Errors } from '@shared'
import { FileSystem, Path, Tests } from '@shared/os'
import { runReview } from '../incremental-review/incremental-review'
import { acceptSelection } from '../incremental-review/ReviewAccept'
import { git, head, resolveGitIndexPath } from '../incremental-review/ReviewGit'
import { planSelection } from '../incremental-review/ReviewPlan'
import { loadSession, saveSession } from '../incremental-review/ReviewSession'
import type { ReviewStatus } from '../incremental-review/ReviewTypes'
import { put, read, withFixture } from './ReviewFixture'

Tests.test('continuation inherits acceptance and evidence while reopening uses the original baseline', async () => {
  await withFixture({ content: 'original\n', other: 'original\n' }, async ({ root, session }) => {
    await put(root, 'content', 'accepted\n')
    await acceptSelection(session, await planSelection(session, ['content']))
    session.recheck = ['other']
    session.notes = ['Retain this concern']
    await saveSession(session)
    await put(root, '.artifacts/notes/incremental-review/progress.json', '{"completed":1}\n')
    await put(root, '.artifacts/notes/incremental-review/current-group.md', 'Current group\n')
    const next = Path.join(root, '.artifacts/next')
    await git(root, ['worktree', 'add', '-b', 'feat/next', next, 'HEAD'])
    await put(root, 'content', 'old pending edit\n')
    await put(root, 'other', 'old staged edit\n')
    await git(root, ['add', 'other'])
    await put(next, 'content', 'new pending edit\n')
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
    Tests.expect(await FileSystem.exists(Path.join(continued.directory, 'journal.json'))).toBe(false)
    Tests.expect(await FileSystem.exists(Path.join(continued.directory, 'evidence/previous/session.json'))).toBe(true)
    await Tests.expect(() => runReview(args)).toThrow('already exists')
    await runReview(['reopen', '--repo', next, '--files', 'content'])
    Tests.expect(await read(continued.reviewedRoot, 'content')).toBe('original\n')
    Tests.expect(await read(next, 'content')).toBe('new pending edit\n')
    Tests.expect(await captureOldState(root, session.reviewedRoot)).toEqual(before)
  })
})

Tests.test('an existing destination branch refuses before installing continuation history', async () => {
  await withFixture({ content: 'original\n' }, async ({ root, session }) => {
    const next = Path.join(root, '.artifacts/next')
    await git(root, ['worktree', 'add', '-b', 'feat/next', next, 'HEAD'])
    const branch = 'feat/next-incremental-review-approved'
    await git(root, ['branch', branch])
    await put(root, '.artifacts/notes/incremental-review/progress.json', '{"completed":1}\n')
    await Tests.expect(() => runReview(['continue', '--repo', next, '--from', root, '--branch', branch]))
      .toThrow('branch already exists')
    const state = Path.join(next, '.artifacts/notes/incremental-review')
    Tests.expect(await FileSystem.exists(Path.join(state, 'progress.json'))).toBe(false)
    Tests.expect(await FileSystem.readdir(Path.join(state, 'active'))).toEqual(['operation.lock'])
    await git(next, ['switch', '-c', 'feat/retry'])
    await runReview(['continue', '--repo', next, '--from', root, '--branch', 'feat/retry-incremental-review-approved'])
    Tests.expect(await head((await loadSession(next)).reviewedRoot)).toBe(await head(session.reviewedRoot))
  })
})

Tests.test('continuation refuses interrupted and foreign source sessions before creating a branch', async () => {
  await withFixture({ content: 'original\n' }, async ({ root, session }) => {
    await put(root, 'content', 'accepted\n')
    const selection = await planSelection(session, ['content'])
    await Tests.expect(() =>
      acceptSelection(session, selection, {
        atPhase() {
          Errors.ThrowUserInput('Interrupted fixture')
        },
      })
    ).toThrow()
    const next = Path.join(root, '.artifacts/next')
    await git(root, ['worktree', 'add', '-b', 'feat/next', next, 'HEAD'])
    const args = ['continue', '--repo', next, '--from', root, '--branch', 'feat/next-incremental-review-approved']
    await Tests.expect(() => runReview(args)).toThrow('interrupted acceptance')
    await FileSystem.rm(Path.join(session.directory, 'journal.json'))
    session.id = 'foreign'
    await saveSession(session)
    await Tests.expect(() => runReview(args)).toThrow('ownership')
    Tests.expect((await git(root, ['branch', '--list', 'feat/next-incremental-review-approved'])).trim()).toBe('')
  })
})

async function captureOldState(root: string, reviewedRoot: string) {
  return {
    sourceHead: await head(root),
    reviewedHead: await head(reviewedRoot),
    index: await FileSystem.readFile(await resolveGitIndexPath(root)),
    content: await read(root, 'content'),
    other: await read(root, 'other'),
    session: await read(root, '.artifacts/notes/incremental-review/active/session.json'),
  }
}

async function readReviewStatus(root: string): Promise<ReviewStatus> {
  const result = await runReview(['status', '--repo', root])
  if (!('recheck' in result) || !('pending' in result)) {
    Errors.ThrowShouldNeverHappen('Incremental review status returned a different command result.')
  }
  return result
}
