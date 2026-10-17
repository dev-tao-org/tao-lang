import { runSteps } from '@cli-kit'
import { workspaceFormat, workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import performanceCommand from './performance'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, check and test the new TypeScript workspace.',
  async action() {
    // App compilation, IDE build and runtime packaging await their new implementations.
    await runSteps(
      () => workspaceFormat('fmt'),
      () => check.action(),
      () => workspaceTests(),
      () => performanceCommand.action('parser'),
    )
  },
})
