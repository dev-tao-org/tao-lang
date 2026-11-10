import * as Tests from '@shared-tests'
import { Path, Repo } from '@shared/os'
import { assertNewWorkspacePath } from '../CLIs-src/cli-checks/check'

Tests.test('workspace paths reject parent escapes, legacy code and files outside a selected test root', () => {
  const root = Repo.getWorkspaceRoot()
  const workspace = Repo.resolvePath('ts')
  Tests.expect(() => assertNewWorkspacePath(Repo.resolvePath('AGENTS.md'))).not.toThrow()
  Tests.expect(() => assertNewWorkspacePath(Path.resolve(root, '../outside.test.ts'))).toThrow('inside')
  Tests.expect(() => assertNewWorkspacePath(Repo.resolvePath('.x-tao-old-v1/package.json'))).toThrow('legacy')
  Tests.expect(() => assertNewWorkspacePath(Repo.resolvePath('AGENTS.md'), workspace)).toThrow('inside')
  Tests.expect(() => assertNewWorkspacePath(Repo.resolvePath('ts/package.json'), workspace)).not.toThrow()
})
