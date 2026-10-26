import { Tests } from '@shared/os'
import { chooseDiffBase, diffArguments, type DiffBaseStorage } from '../dev-tao-org-src/DiffReview'

Tests.test('review convention is automatic and overrides belong to one worktree and source branch', async () => {
  const values = new Map<string, string>()
  const storage: DiffBaseStorage = {
    get: key => values.get(key),
    update(key, value) {
      values.set(key, value)
      return Promise.resolve()
    },
  }
  const prompts: unknown[] = []
  const pick = async (branches: readonly string[], selected: string | undefined) => {
    prompts.push({ branches, selected })
    return 'main'
  }
  const a = 'feat/a-incremental-review-approved'
  const b = 'feat/b-incremental-review-approved'
  const branches = [a, b, 'main']
  Tests.expect(await chooseDiffBase('/worktree/one', 'feat/a', branches, storage, pick)).toBe(a)
  Tests.expect(prompts).toHaveLength(0)
  await chooseDiffBase('/worktree/one', 'feat/a', branches, storage, pick, true)
  Tests.expect(prompts[0]).toEqual({ branches, selected: a })
  Tests.expect(await chooseDiffBase('/worktree/one', 'feat/a', branches, storage, pick)).toBe('main')
  Tests.expect(await chooseDiffBase('/worktree/two', 'feat/a', branches, storage, pick)).toBe(a)
  Tests.expect(await chooseDiffBase('/worktree/one', 'feat/b', branches, storage, pick)).toBe(b)
  Tests.expect(await chooseDiffBase('/worktree/one', 'feat/a', branches, storage, async () => undefined, true))
    .toBeUndefined()
  Tests.expect(await chooseDiffBase('/worktree/one', 'feat/a', branches, storage, pick)).toBe('main')
})

Tests.test('missing review branches and detached worktrees report the problem without a fallback picker', async () => {
  const storage: DiffBaseStorage = { get: () => undefined, update: () => Promise.resolve() }
  let prompts = 0
  const pick = async () => {
    prompts++
    return 'main'
  }
  await Tests.expect(chooseDiffBase('/one', 'feat/a', ['main'], storage, pick))
    .rejects.toThrow('feat/a-incremental-review-approved')
  await Tests.expect(chooseDiffBase('/one', undefined, ['main'], storage, pick))
    .rejects.toThrow('detached')
  Tests.expect(prompts).toBe(0)
  Tests.expect(await chooseDiffBase('/one', 'feat/a', ['main'], storage, pick, true)).toBe('main')
})

Tests.test('file comparison places the selected branch left of the working copy with no selection', () => {
  const uri = { fsPath: '/worktree with spaces/file.ts' }
  Tests.expect(diffArguments('/worktree with spaces', 'origin/review', uri)).toEqual({
    repoPath: '/worktree with spaces',
    lhs: { sha: 'origin/review', uri },
    rhs: { sha: '', uri },
    fromComparison: true,
    range: null,
  })
})
