import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'
import {
  assertNewWorkspacePath,
  assertNewWorkspaceTree,
  registerCommand,
  repositoryRoot,
  workspaceTests,
} from './_command-runner'

/** testCommand runs the TypeScript workspace tests and preserves their verdict. */
export default registerCommand({
  name: 'test',
  description: 'Run new workspace tests; a path scopes the run and a name filters it.',
  arguments: [{ name: 'target', description: 'Test file or directory.' }],
  action: async (target?: string) => {
    await assertNewWorkspaceTree()
    if (target) {
      assertNewWorkspacePath(Path.resolve(repositoryRoot, target))
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
  const path = Path.isAbsolute(target) || FileSystem.existsSync(Path.resolve(`${repositoryRoot}/ts`, target))
    ? Path.resolve(`${repositoryRoot}/ts`, target)
    : Path.resolve(repositoryRoot, target)
  assertNewWorkspacePath(path)
  if (!FileSystem.existsSync(path)) {
    return Path.isAbsolute(target) ? path : undefined
  }
  if (!FileSystem.statSync(path).isDirectory()) {
    return path
  }
  const canonical = FileSystem.realpathSync(path)
  const root = FileSystem.realpathSync(repositoryRoot)
  const workspace = FileSystem.realpathSync(`${repositoryRoot}/ts`)
  if (canonical === root) {
    return workspace
  }
  if (canonical !== workspace && !canonical.startsWith(`${workspace}/`)) {
    Errors.ThrowUserInput('Test directory targets must be inside ts/; run legacy workflows from old-tao-v1/.')
  }
  return canonical
}
