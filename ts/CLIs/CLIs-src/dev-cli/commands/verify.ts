import { runSteps } from '@cli-kit'
import {
  workspaceConformance,
  workspaceDeadExports,
  workspaceFormat,
  workspaceShellSyntax,
  workspaceTests,
  workspaceTypes,
} from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import doctor from './doctor'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, check and test the new TypeScript workspace.',
  async action() {
    // Parser, app compilation, IDE build and runtime packaging await their new implementations.
    await runSteps(
      () => workspaceFormat('fmt'),
      () => doctor.action([]),
      () => workspaceTypes(),
      () => workspaceShellSyntax(),
      () => workspaceConformance(),
      () => workspaceDeadExports(),
      () => workspaceTests(),
    )
  },
})
