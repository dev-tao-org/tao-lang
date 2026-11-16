import * as Tests from '@shared-tests'
import { Path, Repo } from '@shared/os'

Tests.test('workspace paths reject parent escapes, legacy code and files outside a selected test root', () => {
  const root = Repo.getWorkspaceRoot()
  const workspace = Repo.resolvePath('ts')
  Tests.expect(() => Repo.assertNewWorkspacePath(Repo.resolvePath('AGENTS.md'))).not.toThrow()
  Tests.expect(() => Repo.assertNewWorkspacePath(Path.resolve(root, '../outside.test.ts'))).toThrow('inside')
  Tests.expect(() => Repo.assertNewWorkspacePath(Repo.resolvePath('.x-tao-old-v1/package.json'))).toThrow('legacy')
  Tests.expect(() => Repo.assertNewWorkspacePath(Repo.resolvePath('AGENTS.md'), workspace)).toThrow('inside')
  Tests.expect(() => Repo.assertNewWorkspacePath(Repo.resolvePath('ts/package.json'), workspace)).not.toThrow()
})
