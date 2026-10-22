import { Errors } from '@shared'
import { FileSystem, Path, Tests } from '@shared/os'
import { runReview } from '../incremental-review/incremental-review'
import {
  acceptSelection,
  recoverAcceptance,
} from '../incremental-review/ReviewAccept'
import { git, head, readJson, resolveGitIndexPath } from '../incremental-review/ReviewGit'
import { planSelection } from '../incremental-review/ReviewPlan'
import { reviewStatus, startReview } from '../incremental-review/ReviewSession'
import { put, read, withFixture } from './ReviewFixture'

Tests.test('whole-file acceptance commits only saved approved files and retains unrelated staging and bytes', async () => {
  await withFixture({ accepted: 'before\n', other: 'before\n' }, async ({ root, session }) => {
    await put(root, 'accepted', 'accepted correction\n')
    await put(root, 'other', 'staged\n')
    await git(root, ['add', '--', 'other'])
    await put(root, 'other', 'staged plus unstaged\n')
    const staged = await git(root, ['show', ':other'])
    await acceptSelection(session, await planSelection(session, ['accepted']))
    Tests.expect(await git(root, ['show', 'HEAD:accepted'])).toBe('accepted correction\n')
    Tests.expect(await git(root, ['show', 'HEAD:other'])).toBe('before\n')
    Tests.expect(await git(root, ['show', ':other'])).toBe(staged)
    Tests.expect(await read(root, 'other')).toBe('staged plus unstaged\n')
    Tests.expect(await read(session.reviewedRoot, 'accepted')).toBe('accepted correction\n')
    Tests.expect(await read(session.reviewedRoot, 'other')).toBe('before\n')
    const provenance = await git(session.reviewedRoot, ['log', '-1', '--format=%B'])
    Tests.expect(provenance).toContain(`Source: ${await head(root)}`)
    Tests.expect(provenance).toContain('Kind: files')
    Tests.expect(provenance).toContain('Path: "accepted"')
    Tests.expect((await git(root, ['diff', '--cached', '--name-only'])).trim()).toBe('other')
    Tests.expect((await git(session.reviewedRoot, ['status', '--porcelain'])).trim()).toBe('')
    const status = await reviewStatus(session)
    Tests.expect(status.pending).toContain('other')
    Tests.expect(status.gitLens).toContain('Working Tree')
  })
})

Tests.test('accepting committed content and deletion moves only the reviewed branch', async () => {
  await withFixture({ removed: 'remove\n', kept: 'old\n' }, async ({ root, session }) => {
    const source = await head(root)
    await acceptSelection(session, await planSelection(session, ['removed', 'kept']))
    Tests.expect(await head(root)).toBe(source)
    Tests.expect(await FileSystem.exists(Path.join(session.reviewedRoot, 'removed'))).toBe(false)
    Tests.expect(await read(session.reviewedRoot, 'kept')).toBe('already committed\n')
  }, async root => {
    await FileSystem.rm(Path.join(root, 'removed'))
    await put(root, 'kept', 'already committed\n')
    await git(root, ['add', '-A'])
    await git(root, ['commit', '-m', 'Committed implementation changes'])
  })
})

Tests.test('literal folders include only their deletion and rename paths, including glob characters', async () => {
  await withFixture(
    { 'scope/[old].txt': 'move\n', 'outside/deleted': 'keep in reviewed\n' },
    async ({ root, session }) => {
      await FileSystem.rename(Path.join(root, 'scope/[old].txt'), Path.join(root, 'scope/[new].txt'))
      await FileSystem.rm(Path.join(root, 'outside/deleted'))
      await acceptSelection(session, await planSelection(session, ['scope']))
      Tests.expect(await FileSystem.exists(Path.join(session.reviewedRoot, 'scope/[old].txt'))).toBe(false)
      Tests.expect(await read(session.reviewedRoot, 'scope/[new].txt')).toBe('move\n')
      Tests.expect(await read(session.reviewedRoot, 'outside/deleted')).toBe('keep in reviewed\n')
      Tests.expect(await FileSystem.exists(Path.join(root, 'outside/deleted'))).toBe(false)
    },
  )
})

Tests.test('whole-file acceptance retains executable mode and symlink targets without reading target contents', async () => {
  await withFixture({ script: 'echo fixture\n', target: 'outside approved selection\n' }, async ({ root, session }) => {
    await FileSystem.chmod(Path.join(root, 'script'), 0o755)
    await FileSystem.symlink('target', Path.join(root, 'link'))
    await acceptSelection(session, await planSelection(session, ['script', 'link']))
    Tests.expect((await git(root, ['ls-tree', 'HEAD', '--', 'script'])).startsWith('100755')).toBe(true)
    Tests.expect(await FileSystem.readlink(Path.join(session.reviewedRoot, 'link'))).toBe('target')
    Tests.expect((await git(root, ['ls-tree', 'HEAD', '--', 'link'])).startsWith('120000')).toBe(true)
  })
})

Tests.test('an interruption after the source commit recovers exact frozen commits idempotently', async () => {
  await withFixture({ accepted: 'before\n', other: 'before\n' }, async ({ root, session }) => {
    await put(root, 'accepted', 'after\n')
    await put(root, 'other', 'staged\n')
    await git(root, ['add', '--', 'other'])
    await put(root, 'other', 'unstaged retained\n')
    const selection = await planSelection(session, ['accepted'])
    await Tests.expect(() =>
      acceptSelection(session, selection, {
        atPhase(point) {
          if (point === 'source') {
            Errors.ThrowUserInput('Fixture interruption')
          }
        },
      })
    ).toThrow('Fixture interruption')
    Tests.expect(await head(root)).not.toBe(selection.sourceHead)
    Tests.expect(await head(session.reviewedRoot)).toBe(selection.reviewedHead)
    await FileSystem.writeFile(
      `${await resolveGitIndexPath(root)}.lock`,
      JSON.stringify({ session: session.id, proposal: selection.proposal }),
    )
    await runReview(['recover', '--repo', root])
    const recovered = await head(root)
    const reviewed = await head(session.reviewedRoot)
    await recoverAcceptance(session)
    Tests.expect(await head(root)).toBe(recovered)
    Tests.expect(await head(session.reviewedRoot)).toBe(reviewed)
    Tests.expect(await read(session.reviewedRoot, 'accepted')).toBe('after\n')
    Tests.expect(await git(root, ['show', ':other'])).toBe('staged\n')
    Tests.expect(await read(root, 'other')).toBe('unstaged retained\n')
    const receipt = await readJson<{ phase: string; selection: { kind: string } }>(
      Path.join(session.directory, 'receipts', `${selection.proposal}.json`),
    )
    Tests.expect(receipt.phase).toBe('complete')
    Tests.expect(receipt.selection.kind).toBe('files')
  })
})

Tests.test('Git external content transforms refuse before snapshotting selected files', async () => {
  await withFixture({ content: 'base\n' }, async ({ root, session }) => {
    await put(root, '.gitattributes', 'content filter=unsupported\n')
    await git(root, ['config', '--local', 'filter.unsupported.clean', 'false'])
    await git(root, ['config', '--local', 'filter.unsupported.required', 'true'])
    await put(root, 'content', 'approved\n')
    const source = await head(root)
    await Tests.expect(() => planSelection(session, ['content'])).toThrow('Unsupported Git content transform')
    Tests.expect(await head(root)).toBe(source)
    Tests.expect(await read(root, 'content')).toBe('approved\n')
    await Tests.expect(() => reviewStatus(session)).toThrow('Unsupported Git content transform')
  })
})

Tests.test('resume checks ownership, stale proposals refuse and semantic rechecks can clear', async () => {
  await withFixture({ accepted: 'before\n' }, async ({ root, session }) => {
    Tests.expect((await startReview(root, 'main', 'feat/implementation-incremental-review-approved')).id).toBe(
      session.id,
    )
    await put(root, 'accepted', 'first proposal\n')
    const selection = await planSelection(session, ['accepted'])
    await put(root, 'accepted', 'unseen edit\n')
    const source = await head(root)
    await Tests.expect(() => acceptSelection(session, selection)).toThrow('Saved disk content changed')
    Tests.expect(await head(root)).toBe(source)
    await runReview(['recheck', '--repo', root, '--files', 'accepted'])
    Tests.expect((await runReview(['status', '--repo', root])).recheck).toEqual(['accepted'])
    await runReview(['recheck', '--repo', root, '--files', 'accepted', '--state', 'clear'])
    Tests.expect((await runReview(['status', '--repo', root])).recheck).toEqual([])
    await put(session.reviewedRoot, 'foreign', 'do not overwrite\n')
    await Tests.expect(() => planSelection(session, ['accepted'])).toThrow('unapproved work')
    Tests.expect(await read(session.reviewedRoot, 'foreign')).toBe('do not overwrite\n')
  })
})

Tests.test('reopening restores only reviewed content and preserves the entire implementation state', async () => {
  await withFixture({ accepted: 'before\n', other: 'before\n' }, async ({ root, session }) => {
    await put(root, 'accepted', 'accepted\n')
    await acceptSelection(session, await planSelection(session, ['accepted']))
    await put(root, 'accepted', 'later unstaged edit\n')
    await put(root, 'other', 'staged unrelated\n')
    await git(root, ['add', '--', 'other'])
    const source = await head(root)
    const index = await git(root, ['ls-files', '--stage', '-z'])
    await runReview(['reopen', '--repo', root, '--files', 'accepted'])
    Tests.expect(await head(root)).toBe(source)
    Tests.expect(await git(root, ['ls-files', '--stage', '-z'])).toBe(index)
    Tests.expect(await read(root, 'accepted')).toBe('later unstaged edit\n')
    Tests.expect(await read(session.reviewedRoot, 'accepted')).toBe('before\n')
    Tests.expect((await runReview(['status', '--repo', root])).pending).toContain('accepted')
  })
})

Tests.test('recovery resumes every tree and ref transition without replacing unrelated work', async () => {
  for (const interrupt of ['index', 'reviewed-tree', 'reviewed-ref', 'session']) {
    await withFixture({ accepted: 'before\n', other: 'before\n' }, async ({ root, session }) => {
      await put(root, 'accepted', 'after\n')
      await put(root, 'other', 'staged\n')
      await git(root, ['add', '--', 'other'])
      await put(root, 'other', 'unstaged\n')
      const selection = await planSelection(session, ['accepted'])
      await Tests.expect(() =>
        acceptSelection(session, selection, {
          atPhase(point) {
            if (point === interrupt) {
              Errors.ThrowUserInput(`Interrupted at ${point}`)
            }
          },
        })
      ).toThrow()
      await recoverAcceptance(session)
      await recoverAcceptance(session)
      Tests.expect(await read(session.reviewedRoot, 'accepted')).toBe('after\n')
      Tests.expect(await git(root, ['show', ':other'])).toBe('staged\n')
      Tests.expect(await read(root, 'other')).toBe('unstaged\n')
    })
  }
})
