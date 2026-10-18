import { FileSystem, Path, Repo } from '@shared/os'
import {
  assertNewWorkspacePath,
  assertNewWorkspaceTree,
  workspaceTests,
} from '../../cli-checks/check'
import { runTaoTests } from '../testing/TaoTests'
import { registerCommand } from './_command-runner'

/** testCommand runs the TypeScript workspace tests and preserves their verdict. */
export default registerCommand({
  name: 'test',
  description: 'Run new workspace tests; a path scopes the run and a name filters it.',
  arguments: [{ name: 'target', description: 'Test file or directory.' }],
  async action(target?: string) {
    if (target?.endsWith('.tao')) {
      await runTaoTests(Repo.resolvePath(target))
      return
    }
    await assertNewWorkspaceTree()
    if (target) {
      assertNewWorkspacePath(Repo.resolvePath(target))
    }
    const workspaceTarget = workspaceTestTarget(target)
    const args = workspaceTarget ? [workspaceTarget] : target ? ['--test-name-pattern', target] : []
    await workspaceTests(args)
  },
})

function workspaceTestTarget(target: string | undefined): string | undefined {
  if (!target) {
    return undefined
  }
  const path = Path.isAbsolute(target) || FileSystem.existsSync(Path.resolve(Repo.resolvePath('ts'), target))
    ? Path.resolve(Repo.resolvePath('ts'), target)
    : Repo.resolvePath(target)
  assertNewWorkspacePath(path)
  const canonical = FileSystem.existsSync(path) ? FileSystem.realpathSync(path) : path
  const root = FileSystem.realpathSync(Repo.getWorkspaceRoot())
  const workspace = FileSystem.realpathSync(Repo.resolvePath('ts'))
  if (canonical === root) {
    return workspace
  }
  if (FileSystem.existsSync(path) || Path.isAbsolute(target)) {
    assertNewWorkspacePath(path, workspace)
    return canonical
  }
  return undefined
}
