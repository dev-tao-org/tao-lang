import { FileSystem, Path, Repo, Tests } from '@shared/os'
import { runSkillScript } from '../../agent-cli/skills/SkillScript'
import { runReview } from '../incremental-review/incremental-review'
import { acceptSelection } from '../incremental-review/ReviewAccept'
import {
  diffPatch,
  git,
  head,
  privateIndex,
  snapshot,
  tree,
} from '../incremental-review/ReviewGit'
import { planSelection } from '../incremental-review/ReviewPlan'
import { put, read, withFixture } from './ReviewFixture'

Tests.test('partial correction preserves separate staged and unstaged hunks in the same file', async () => {
  const baseline = lines()
  await withFixture({ content: baseline, other: 'before\n' }, async ({ root, session }) => {
    const approved = baseline.replace('line 2\n', 'approved line 2\n')
    await put(root, 'content', approved)
    const acceptedTree = await snapshot(root, session.directory, 'HEAD', ['content'])
    const patch = await diffPatch(root, 'HEAD', acceptedTree, ['content'])
    const patchPath = Path.join(session.directory, 'approved.patch')
    await FileSystem.writeFile(patchPath, patch)
    const staged = baseline.replace('line 12\n', 'staged line 12\n')
    await put(root, 'content', staged)
    await git(root, ['add', '--', 'content'])
    const saved = staged.replace('line 2\n', 'approved line 2\n').replace('line 24\n', 'unstaged line 24\n')
    await put(root, 'content', saved)
    const proposal = await planSelection(session, ['content'], { source: patchPath, reviewed: patchPath })
    await acceptSelection(session, proposal)
    Tests.expect(await git(root, ['show', 'HEAD:content'])).toBe(approved)
    Tests.expect(await git(root, ['show', ':content'])).toBe(staged.replace('line 2\n', 'approved line 2\n'))
    Tests.expect(await read(root, 'content')).toBe(saved)
    Tests.expect(await read(session.reviewedRoot, 'content')).toBe(approved)
  })
})

Tests.test('a partially staged approved hunk commits while separate unstaged work remains saved', async () => {
  const baseline = lines()
  await withFixture({ content: baseline }, async ({ root, session }) => {
    const approved = baseline.replace('line 2\n', 'approved line 2\n')
    await put(root, 'content', approved)
    await git(root, ['add', '--', 'content'])
    const acceptedTree = await tree(root)
    const patchPath = Path.join(session.directory, 'staged.patch')
    await FileSystem.writeFile(patchPath, await diffPatch(root, 'HEAD', acceptedTree, ['content']))
    await put(root, 'content', approved.replace('line 24\n', 'unstaged line 24\n'))
    await acceptSelection(
      session,
      await planSelection(session, ['content'], { source: patchPath, reviewed: patchPath }),
    )
    Tests.expect((await git(root, ['diff', '--cached'])).trim()).toBe('')
    Tests.expect(await read(root, 'content')).toContain('unstaged line 24')
    Tests.expect(await read(session.reviewedRoot, 'content')).toBe(approved)
  })
})

Tests.test('a partial fix needing absent reviewed context refuses before either branch commits', async () => {
  await withFixture({ content: 'base\n' }, async ({ root, session }) => {
    await put(root, 'content', 'feature fixed\n')
    const candidate = await snapshot(root, session.directory, 'HEAD', ['content'])
    const patchPath = Path.join(session.directory, 'context.patch')
    await FileSystem.writeFile(patchPath, await diffPatch(root, 'HEAD', candidate, ['content']))
    const source = await head(root)
    const reviewed = await head(session.reviewedRoot)
    await Tests.expect(() => planSelection(session, ['content'], { source: patchPath, reviewed: patchPath }))
      .toThrow('Include the missing reviewed context or defer')
    Tests.expect(await head(root)).toBe(source)
    Tests.expect(await head(session.reviewedRoot)).toBe(reviewed)
    Tests.expect(await read(root, 'content')).toBe('feature fixed\n')
  }, async root => {
    await put(root, 'content', 'feature context\n')
    await git(root, ['add', '--', 'content'])
    await git(root, ['commit', '-m', 'Implementation context absent from reviewed branch'])
  })
})

Tests.test('partial proposals require saved approved bytes and reject ambiguous staged overlap', async () => {
  await withFixture({ content: 'base\n' }, async ({ root, session }) => {
    await put(root, 'content', 'approved\n')
    const candidate = await snapshot(root, session.directory, 'HEAD', ['content'])
    const patchPath = Path.join(session.directory, 'approved.patch')
    await FileSystem.writeFile(patchPath, await diffPatch(root, 'HEAD', candidate, ['content']))
    await put(root, 'content', 'different staged\n')
    await git(root, ['add', '--', 'content'])
    await put(root, 'content', 'approved\n')
    const source = await head(root)
    await Tests.expect(() => planSelection(session, ['content'], { source: patchPath, reviewed: patchPath }))
      .toThrow('cannot be applied safely')
    Tests.expect(await head(root)).toBe(source)
    Tests.expect(await git(root, ['show', ':content'])).toBe('different staged\n')
    await put(root, 'content', 'unapproved disk\n')
    await Tests.expect(() => planSelection(session, ['content'], { source: patchPath, reviewed: patchPath }))
      .toThrow('cannot be applied safely')
  })
})

Tests.test('frozen selection rejects tampering and changed staged content before mutations', async () => {
  await withFixture({ content: 'base\n' }, async ({ root, session }) => {
    await put(root, 'content', 'approved\n')
    const proposal = await planSelection(session, ['content'])
    const source = await head(root)
    await Tests.expect(() => acceptSelection(session, { ...proposal, files: ['.git/config'] }))
      .toThrow('immutable proposal')
    await git(root, ['add', '--', 'content'])
    await Tests.expect(() => acceptSelection(session, proposal)).toThrow('Staged content changed')
    Tests.expect(await head(root)).toBe(source)
  })
})

Tests.test('a reviewed patch inventing content absent from saved disk refuses before source mutation', async () => {
  await withFixture({ content: 'base\n' }, async ({ root, session }) => {
    await put(root, 'content', 'invented unapproved\n')
    const candidate = await snapshot(root, session.directory, 'HEAD', ['content'])
    const path = Path.join(session.directory, 'invented.patch')
    await FileSystem.writeFile(path, await diffPatch(root, 'HEAD', candidate, ['content']))
    await put(root, 'content', 'saved approved\n')
    const source = await head(root)
    const index = await git(root, ['ls-files', '--stage', '-z'])
    await Tests.expect(() => planSelection(session, ['content'], { reviewed: path })).toThrow(
      'cannot be applied safely',
    )
    Tests.expect(await head(root)).toBe(source)
    Tests.expect(await git(root, ['ls-files', '--stage', '-z'])).toBe(index)
  })
})

Tests.test('a pending reviewed correction requires its source patch before either branch can advance', async () => {
  await withFixture({ content: 'base\n' }, async ({ root, session }) => {
    await put(root, 'content', 'approved pending correction\n')
    const candidate = await snapshot(root, session.directory, 'HEAD', ['content'])
    const patchPath = Path.join(session.directory, 'pending-correction.patch')
    await FileSystem.writeFile(patchPath, await diffPatch(root, 'HEAD', candidate, ['content']))
    const source = await head(root)
    const reviewed = await head(session.reviewedRoot)
    const index = await git(root, ['ls-files', '--stage', '-z'])
    await Tests.expect(() => planSelection(session, ['content'], { reviewed: patchPath })).toThrow(
      'cannot be applied safely',
    )
    Tests.expect(await head(root)).toBe(source)
    Tests.expect(await head(session.reviewedRoot)).toBe(reviewed)
    Tests.expect(await git(root, ['ls-files', '--stage', '-z'])).toBe(index)
    Tests.expect(await read(root, 'content')).toBe('approved pending correction\n')
    const selection = await planSelection(session, ['content'], { source: patchPath, reviewed: patchPath })
    await acceptSelection(session, selection)
    Tests.expect(await git(root, ['show', 'HEAD:content'])).toBe('approved pending correction\n')
    Tests.expect(await read(session.reviewedRoot, 'content')).toBe('approved pending correction\n')
  })
})

Tests.test('entry plan and accept use a frozen JSON proposal; help needs no session', async () => {
  Tests.expect((await runReview(['--help'])).commands).toContain('status')
  const entry = Repo.resolvePath('agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts')
  await withFixture({ content: 'base\n' }, async ({ root, session }) => {
    await put(root, 'content', 'approved\n')
    const out = Path.join(session.directory, 'proposal.json')
    await runSkillScript(entry, ['plan', '--repo', root, '--files', 'content', '--out', out])
    Tests.expect(await FileSystem.exists(out)).toBe(true)
    await runSkillScript(entry, ['status', '--repo', root])
    await runSkillScript(entry, ['accept', '--repo', root, '--selection', out])
    Tests.expect(await git(root, ['show', 'HEAD:content'])).toBe('approved\n')
    Tests.expect(await read(session.reviewedRoot, 'content')).toBe('approved\n')
  }, async root => {
    await runSkillScript(entry, [
      'start',
      '--repo',
      root,
      '--base',
      'main',
      '--branch',
      'feat/implementation-incremental-review-approved',
    ])
  })
})

Tests.test('explicit reviewed and source patches can use different baselines without importing context', async () => {
  const baseline = lines()
  await withFixture({ content: baseline }, async ({ root, session }) => {
    const correction = (await read(root, 'content')).replace('line 2\n', 'corrected line 2\n')
    await put(root, 'content', correction)
    const sourceCandidate = await snapshot(root, session.directory, 'HEAD', ['content'])
    const sourcePatch = Path.join(session.directory, 'source.patch')
    const reviewedPatch = Path.join(session.directory, 'reviewed.patch')
    await FileSystem.writeFile(sourcePatch, await diffPatch(root, 'HEAD', sourceCandidate, ['content']))
    const reviewedIndex = await privateIndex(root, session.directory, session.baseCommit)
    const reviewedBlob =
      (await git(root, ['hash-object', '-w', '--stdin'], { input: baseline.replace('line 2\n', 'corrected line 2\n') }))
        .trim()
    await git(root, ['update-index', '--cacheinfo', '100644', reviewedBlob, 'content'], { index: reviewedIndex })
    await FileSystem.writeFile(
      reviewedPatch,
      await diffPatch(root, session.baseCommit, await tree(root, reviewedIndex), ['content']),
    )
    await acceptSelection(
      session,
      await planSelection(session, ['content'], { source: sourcePatch, reviewed: reviewedPatch }),
    )
    Tests.expect(await git(root, ['show', 'HEAD:content'])).toContain('implementation line 24')
    Tests.expect(await read(session.reviewedRoot, 'content')).toBe(baseline.replace('line 2\n', 'corrected line 2\n'))
  }, async root => {
    await put(root, 'content', baseline.replace('line 24\n', 'implementation line 24\n'))
    await git(root, ['add', '--', 'content'])
    await git(root, ['commit', '-m', 'Separate implementation context'])
  })
})

function lines(): string {
  return Array.from({ length: 30 }, (_, index) => `line ${index + 1}\n`).join('')
}
