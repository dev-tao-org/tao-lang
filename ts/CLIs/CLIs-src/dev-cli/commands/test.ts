import { FS, Path, Repo } from '@shared/os'
import * as Check from '../../cli-checks/check'
import { parseSlowTestSeconds } from '../../cli-checks/slow-tests'
import { runTaoTests } from '../testing/TaoTests'
import { planTestExecution, type TestExecutionOptions } from '../testing/TestPlan'
import { registerCommand } from './_command-runner'

type TestCommandOptions = TestExecutionOptions & { slow?: string }
/** testCommand runs TypeScript and Tao app tests, retaining scoped selections. */
export default registerCommand({
  name: 'test',
  description: 'Run all TypeScript and Tao app tests; optionally select a Tao file or TypeScript path/name.',
  arguments: [{ name: 'target', description: 'Test file or directory.' }],
  options: [{
    flags: '--slow <seconds>',
    description: 'Warn for TypeScript tests exceeding this duration in seconds.',
    defaultValue: '0.075',
  }, {
    flags: '--yes',
    description: 'Authorize required app dependency setup.',
  }, {
    flags: '--serial',
    description: 'Run TypeScript then Tao tests with one worker each.',
  }, {
    flags: '--parallel [workers]',
    description: 'Run concurrently with an optional total worker cap (defaults: 5 TypeScript, 1 Tao).',
  }],
  async action(target?: string, options: TestCommandOptions = {}) {
    const slowSeconds = parseSlowTestSeconds(options.slow)
    const execution = { serial: options.serial, parallel: options.parallel, yes: options.yes }
    planTestExecution(execution)
    if (target?.endsWith('.tao')) {
      const path = Repo.resolvePath(target)
      Repo.assertNewWorkspacePath(path)
      await runTaoTests(path, execution)
      return
    }
    await Check.assertNewWorkspaceTree()
    const workspaceTarget = workspaceTestTarget(target)
    const args = resolveTestArguments(workspaceTarget, target)
    await Check.workspaceTests(args, slowSeconds, execution)
  },
})

type OptionalTestTarget = string | undefined

function resolveTestArguments(workspaceTarget: OptionalTestTarget, target: OptionalTestTarget): string[] {
  if (workspaceTarget) {
    return [workspaceTarget]
  }
  if (target) {
    return ['--test-name-pattern', target]
  }
  return []
}

function workspaceTestTarget(target: OptionalTestTarget): OptionalTestTarget {
  if (!target) {
    return undefined
  }
  const path = resolveTestTargetPath(target)
  const exists = FS.existsSync(path)
  const canonical = exists ? FS.realpathSync(path) : path
  const root = Repo.getWorkspaceRoot()
  const workspace = Repo.resolvePath('ts')
  const isRepositoryRoot = canonical === FS.realpathSync(root)
  const hasPathTarget = exists || Path.isAbsolute(target)
  const allowedRoot = hasPathTarget && !isRepositoryRoot ? workspace : root
  Repo.assertNewWorkspacePath(path, allowedRoot)
  if (isRepositoryRoot) {
    return FS.realpathSync(workspace)
  }
  return hasPathTarget ? canonical : undefined
}

function resolveTestTargetPath(target: string): string {
  const root = Repo.getWorkspaceRoot()
  const repositoryPath = Path.resolve(root, target)
  if (!Path.isWithin(root, repositoryPath)) {
    return repositoryPath
  }
  const workspacePath = Path.resolve(root, 'ts', target)
  return FS.existsSync(workspacePath) ? workspacePath : repositoryPath
}
