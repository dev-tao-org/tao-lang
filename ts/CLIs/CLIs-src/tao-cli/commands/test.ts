import { Env, Path, Repo } from '@shared/os'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { runTaoTests } from '../../dev-cli/testing/TaoTests'
import type { TestExecutionOptions } from '../../dev-cli/testing/TestPlan'

/** taoTestCommand runs Tao app journeys on the default headless target. */
export default registerCommand({
  name: 'test',
  description: 'Run Tao app tests in a file or folder on headless web.',
  arguments: [{ name: 'target', defaultValue: '.', description: 'Tao file or folder.' }],
  options: [{
    flags: '--serial',
    description: 'Run Tao test files with one worker.',
  }, {
    flags: '--parallel [workers]',
    description: 'Run concurrently; optionally override the worker budget (default: 2).',
  }],
  async action(target: string, options: TestExecutionOptions = {}) {
    await runTaoTests(Path.resolve(Env.get('TAO_CLI_CWD') ?? Repo.getWorkspaceRoot(), target), options)
  },
})
