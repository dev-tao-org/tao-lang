import { S } from '@shared'
import { Test } from '@shared/os'
import { withGitPermissions } from '../cli-kit/agent-git-permissions'

const gitPath = '/tao-permission-fixture/repository/.git'
const home = '/tao-permission-fixture/home'

Test.test('Git grants preserve unrelated settings and comments and are idempotent', () => {
  const source = S`
    # Preserve this user's settings.
    model = "existing-model"
    [permissions.tao-workspace.filesystem]
    "/other" = "read"
    [other]
    enabled = true
  `
  const result = withGitPermissions(source, [gitPath], home)
  Test.expect(result).toBe(source.replace('[other]', JSON.stringify(gitPath) + ' = "write"\n[other]'))
  Test.expect(withGitPermissions(result, [gitPath], home)).toBe(result)
  Test.expect(withGitPermissions('', [gitPath], home)).toBe(
    '[permissions.tao-workspace.filesystem]\n' + JSON.stringify(gitPath) + ' = "write"\n',
  )
})

Test.test('Git grants reject restrictive rules and unsupported layouts without rewriting them', () => {
  for (
    const rules of [
      JSON.stringify(gitPath) + ' = "read"',
      '"/tao-permission-fixture" = "deny"',
      JSON.stringify(gitPath + '/objects') + ' = "read"',
      '":workspace_roots" = { "**" = "deny" }',
    ]
  ) {
    Test.expect(() => withGitPermissions('[permissions.tao-workspace.filesystem]\n' + rules, [gitPath], home))
      .toThrow()
  }
  Test.expect(() => withGitPermissions('permissions.tao-workspace.filesystem = { "/other" = "read" }', [gitPath], home))
    .toThrow()
  Test.expect(() => withGitPermissions('model = [', [gitPath], home)).toThrow()
})
