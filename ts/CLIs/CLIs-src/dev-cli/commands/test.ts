import { FileSystem, Path, Repo } from '@shared/os'
import * as Check from '../../cli-checks/check'
import { parseSlowTestSeconds } from '../../cli-checks/slow-tests'
import { runTaoTests } from '../testing/TaoTests'
import { planTestExecution, type TestExecutionOptions } from '../testing/TestPlan'
import { registerCommand } from './_command-runner'

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
    description: 'Run concurrently; optionally override the total worker budget (default: 6).',
  }],
  async action(target?: string, options: { slow?: string } & TestExecutionOptions = {}) {
    const slowSeconds = parseSlowTestSeconds(options.slow)
    const execution = { serial: options.serial, parallel: options.parallel, yes: options.yes }
    planTestExecution(execution)
    if (target?.endsWith('.tao')) {
      const path = Repo.resolvePath(target)
      Check.assertNewWorkspacePath(path)
      await runTaoTests(path, execution)
      return
    }
    await Check.assertNewWorkspaceTree()
    if (target) {
      Check.assertNewWorkspacePath(Repo.resolvePath(target))
    }
    const workspaceTarget = workspaceTestTarget(target)
    const args = workspaceTarget ? [workspaceTarget] : target ? ['--test-name-pattern', target] : []
    await Check.workspaceTests(args, slowSeconds, execution)
  },
})

function workspaceTestTarget(target: string | undefined): string | undefined {
  if (!target) {
    return undefined
  }
  const path = Path.isAbsolute(target) || FileSystem.existsSync(Path.resolve(Repo.resolvePath('ts'), target))
    ? Path.resolve(Repo.resolvePath('ts'), target)
    : Repo.resolvePath(target)
  Check.assertNewWorkspacePath(path)
  const canonical = FileSystem.existsSync(path) ? FileSystem.realpathSync(path) : path
  const root = FileSystem.realpathSync(Repo.getWorkspaceRoot())
  const workspace = FileSystem.realpathSync(Repo.resolvePath('ts'))
  if (canonical === root) {
    return workspace
  }
  if (FileSystem.existsSync(path) || Path.isAbsolute(target)) {
    Check.assertNewWorkspacePath(path, workspace)
    return canonical
  }
  return undefined
}
