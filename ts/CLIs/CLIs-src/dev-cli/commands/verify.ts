import { runSteps } from '@cli-kit'
import { workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import fmt from './fmt'
import performanceCommand from './performance'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, check and test the new TypeScript workspace.',
  arguments: [{
    name: 'format-paths',
    description: 'Limit formatting to named files or globs; checks stay workspace-wide.',
    variadic: true,
  }],
  async action(paths: string[]) {
    // App compilation, IDE build and runtime packaging await their new implementations.
    await runSteps(
      () => fmt.action(paths),
      () => check.action(),
      () => workspaceTests(),
      () => performanceCommand.action('parser'),
    )
  },
})
