import { FileSystem, Tests } from '@shared/os'
import { runReview } from '../incremental-review/incremental-review'
import { git, head, indexPath } from '../incremental-review/ReviewGit'
import { loadSession, saveSession } from '../incremental-review/ReviewSession'
import { put, withFixture } from './ReviewFixture'

Tests.test('renaming the approved branch retains source index, dirty bytes, refs and accepted content', async () => {
  await withFixture({ content: 'before\n' }, async ({ root, session }) => {
    await git(session.reviewedRoot, ['branch', '-m', 'feat/old-review'])
    session.reviewedBranch = 'feat/old-review'
    await saveSession(session)
    await put(root, 'content', 'staged\n')
    await git(root, ['add', 'content'])
    await put(root, 'content', 'staged and unstaged\n')
    const index = await FileSystem.readFile(await indexPath(root))
    const sourceHead = await head(root)
    const reviewedHead = await head(session.reviewedRoot)
    const branch = `${session.sourceBranch}-incremental-review-approved`
    await runReview(['rename', '--repo', root, '--branch', branch])
    Tests.expect(await FileSystem.readFile(await indexPath(root))).toEqual(index)
    Tests.expect(await head(root)).toBe(sourceHead)
    Tests.expect(await head(session.reviewedRoot)).toBe(reviewedHead)
    Tests.expect((await git(session.reviewedRoot, ['branch', '--show-current'])).trim()).toBe(branch)
    Tests.expect((await loadSession(root)).accepted).toEqual(session.accepted)
    Tests.expect((await loadSession(root)).reviewedBranch).toBe(branch)
    Tests.expect(await FileSystem.readFile(`${root}/content`, 'utf8')).toBe('staged and unstaged\n')
    await runReview(['rename', '--repo', root, '--branch', branch])
  })
})
