import { Repo, Tests } from '@shared/os'
import { shouldPrepareExtensionAssets } from '../cli-checks/check'

Tests.test('workspace test selection prepares IDE assets for broad and name-filtered runs', () => {
  const workspace = Repo.resolvePath('ts')
  const selected: string[] = []
  const cases = [
    { args: [], name: 'all tests' },
    { args: [workspace], name: 'workspace path' },
    { args: [Repo.getWorkspaceRoot()], name: 'repository root path' },
    { args: ['.'], name: 'repository dot path' },
    { args: ['ts'], name: 'workspace relative path' },
    { args: ['--test-name-pattern', 'Unicode'], name: 'Unicode name pattern' },
    { args: ['--test-name-pattern', '.*'], name: 'broad regex name pattern' },
    { args: [Repo.resolvePath('ts/0-workspace')], name: 'unrelated package path' },
  ]
  for (const selection of cases) {
    if (shouldPrepareExtensionAssets(selection.args)) {
      selected.push(selection.name)
    }
  }
  Tests.expect(selected).toEqual([
    'all tests',
    'workspace path',
    'repository root path',
    'repository dot path',
    'workspace relative path',
    'Unicode name pattern',
    'broad regex name pattern',
  ])
})
