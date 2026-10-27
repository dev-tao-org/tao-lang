import { resolveCallerPath } from '@cli-kit'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { runTaoTests } from '../../dev-cli/testing/TaoTests'
import { findTaoTestFiles } from '../../dev-cli/testing/TaoTests'
import type { TestExecutionOptions } from '../../dev-cli/testing/TestPlan'
import { withProjectSessions } from '../ProjectCommand'

/** taoTestCommand runs Tao app journeys on the default headless target. */
export default registerCommand({
  name: 'test',
  description: 'Run Tao app tests in a file or folder on headless web.',
  arguments: [{ name: 'target', defaultValue: '.', description: 'Tao file or folder.' }],
  options: [{
    flags: '--serial',
    description: 'Run Tao test files with one worker.',
  }, {
    flags: '--yes',
    description: 'Authorize required app dependency setup.',
  }, {
    flags: '--parallel [workers]',
    description: 'Run concurrently; optionally override the worker budget (default: 4).',
  }, {
    flags: '--session <id>',
    description: 'Use a named project session lock.',
  }],
  async action(target: string, options: TaoTestCommandOptions = {}) {
    const path = resolveCallerPath(target)
    const tests = await findTaoTestFiles(path)
    await withProjectSessions(tests.length > 0 ? tests : [path], async () => {
      await runTaoTests(path, options)
    }, options.session)
  },
})

type TaoTestCommandOptions = TestExecutionOptions & { session?: string }
