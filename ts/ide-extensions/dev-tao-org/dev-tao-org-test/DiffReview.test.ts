import { Tests } from '@shared/os'
import { chooseDiffBase, diffArguments, type DiffBaseStorage } from '../dev-tao-org-src/DiffReview'

Tests.test('review bases persist per worktree, reprompt when missing, and preserve canceled choices', async () => {
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
  const branches = ['feature', 'main']
  Tests.expect(await chooseDiffBase('/worktree/one', branches, storage, pick)).toBe('main')
  Tests.expect(await chooseDiffBase('/worktree/one', branches, storage, pick)).toBe('main')
  Tests.expect(prompts).toHaveLength(1)
  await chooseDiffBase('/worktree/two', branches, storage, pick)
  Tests.expect(prompts).toHaveLength(2)
  Tests.expect(prompts[0]).toEqual({ branches, selected: 'main' })
  Tests.expect(await chooseDiffBase('/worktree/one', branches, storage, async () => undefined, true))
    .toBeUndefined()
  Tests.expect(await chooseDiffBase('/worktree/one', branches, storage, pick)).toBe('main')
  Tests.expect(await chooseDiffBase('/worktree/one', ['feature'], storage, async () => 'feature')).toBe('feature')
})

Tests.test('file comparison uses the selected repository, branch and working copy with no selection', () => {
  const uri = { fsPath: '/worktree with spaces/file.ts' }
  Tests.expect(diffArguments('/worktree with spaces', 'origin/review', uri)).toEqual({
    repoPath: '/worktree with spaces',
    lhs: { sha: 'origin/review', uri },
    rhs: { sha: '', uri },
    fromComparison: true,
    range: null,
  })
})
