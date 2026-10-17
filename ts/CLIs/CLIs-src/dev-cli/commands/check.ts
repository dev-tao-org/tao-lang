import { runSteps } from '@cli-kit'
import {
  workspaceConformance,
  workspaceDeadExports,
  workspaceFormat,
  workspaceShellSyntax,
  workspaceTypes,
} from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import doctor from './doctor'

/** checkCommand checks the TypeScript workspace. */
export default registerCommand({
  name: 'check',
  description: 'Check setup, types, source conformance, dead exports and formatting without running tests.',
  async action() {
    // App/IDE/runtime checks await their new implementations.
    await runSteps(
      () => doctor.action([]),
      () => workspaceTypes(),
      () => workspaceShellSyntax(),
      () => workspaceConformance(),
      () => workspaceDeadExports(),
      () => workspaceFormat('check'),
    )
  },
})
