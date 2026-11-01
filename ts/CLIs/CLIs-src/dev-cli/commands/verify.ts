import { runSteps } from '@cli-kit'
import { workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import fmt from './fmt'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, check and test the new TypeScript workspace.',
  arguments: [{
    name: 'format-paths',
    description: 'Limit formatting to named files or globs; checks stay workspace-wide.',
    variadic: true,
  }],
  options: [{ flags: '--yes', description: 'Authorize required app dependency setup.' }],
  async action(paths: string[], options: { yes?: boolean } = {}) {
    // Native app journeys await their testing implementation.
    await runSteps(
      () => fmt.action(paths),
      () => check.action(),
      () => workspaceTests([], undefined, { yes: options.yes }),
    )
  },
})
