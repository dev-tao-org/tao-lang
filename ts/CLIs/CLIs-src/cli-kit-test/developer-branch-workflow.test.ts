import { Test } from '@shared/os'
import { normalizeDeveloperBranch, parseDetachedWorktrees } from '../cli-kit/developer-branch-workflow'

Test.test('personal branch names receive a stable dev prefix and normalized suffix', () => {
  Test.expect(normalizeDeveloperBranch('  Spike Two  ')).toBe('dev/spike-two')
  Test.expect(normalizeDeveloperBranch('dev/keep-as-is')).toBe('dev/keep-as-is')
  Test.expect(normalizeDeveloperBranch('A.B_2')).toBe('dev/a.b_2')
})

Test.test('detached worktree parsing excludes branches and prunable checkouts', () => {
  const listing = [
    'worktree /feature\nHEAD aaa\nbranch refs/heads/feat/example',
    'worktree /mirror\nHEAD bbb\ndetached',
    'worktree /gone\nHEAD ccc\ndetached\nprunable gitdir file points to non-existent location',
  ].join('\n\n')
  Test.expect(parseDetachedWorktrees(listing)).toEqual([{ head: 'bbb', path: '/mirror' }])
})
