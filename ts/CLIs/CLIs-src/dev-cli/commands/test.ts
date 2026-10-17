import { Errors } from '@shared'
import { existsSync, realpathSync, statSync } from '@shared/os/FileSystem'
import { isAbsolute, resolve } from '@shared/os/Path'
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
      assertNewWorkspacePath(resolve(repositoryRoot, target))
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
  const path = isAbsolute(target) || existsSync(resolve(`${repositoryRoot}/ts`, target))
    ? resolve(`${repositoryRoot}/ts`, target)
    : resolve(repositoryRoot, target)
  assertNewWorkspacePath(path)
  if (!existsSync(path)) {
    return isAbsolute(target) ? path : undefined
  }
  if (!statSync(path).isDirectory()) {
    return path
  }
  const canonical = realpathSync(path)
  const root = realpathSync(repositoryRoot)
  const workspace = realpathSync(`${repositoryRoot}/ts`)
  if (canonical === root) {
    return workspace
  }
  if (canonical !== workspace && !canonical.startsWith(`${workspace}/`)) {
    Errors.ThrowUserInput('Test directory targets must be inside ts/; run legacy workflows from old-tao-v1/.')
  }
  return canonical
}
