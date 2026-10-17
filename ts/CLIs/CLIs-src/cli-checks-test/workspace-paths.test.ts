import { Path, Repo, Test } from '@shared/os'
import { assertNewWorkspacePath } from '../cli-checks/check'

Test.test('workspace paths reject parent escapes, legacy code and files outside a selected test root', () => {
  const root = Repo.getWorkspaceRoot()
  const workspace = Repo.resolvePath('ts')
  Test.expect(() => assertNewWorkspacePath(Repo.resolvePath('AGENTS.md'))).not.toThrow()
  Test.expect(() => assertNewWorkspacePath(Path.resolve(root, '../outside.test.ts'))).toThrow('inside')
  Test.expect(() => assertNewWorkspacePath(Repo.resolvePath('.x-tao-old-v1/package.json'))).toThrow('legacy')
  Test.expect(() => assertNewWorkspacePath(Repo.resolvePath('AGENTS.md'), workspace)).toThrow('inside')
  Test.expect(() => assertNewWorkspacePath(Repo.resolvePath('ts/package.json'), workspace)).not.toThrow()
})
