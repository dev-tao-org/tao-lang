import * as CLIKit from '@cli-kit'
import * as Check from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import doctor from './doctor'

/** checkCommand checks the TypeScript workspace. */
export default registerCommand({
  name: 'check',
  description: 'Check setup, types, source conformance, dead exports and formatting without running tests.',
  async action() {
    // App/IDE/runtime checks await their new implementations.
    await CLIKit.runSteps(
      () => doctor.action([]),
      () => Check.assertNewWorkspaceTree(),
      () => Check.workspaceTypes(),
      () => Check.workspaceShellSyntax(),
      () => Check.workspaceDeadExports(),
      () => Check.workspaceConformance(),
      () => Check.workspaceFormat('check'),
    )
  },
})
