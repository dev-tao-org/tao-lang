import { runSteps } from '@cli-kit'
import {
  registerCommand,
  workspaceConformance,
  workspaceDeadExports,
  workspaceFormat,
  workspaceTests,
  workspaceTypes,
} from './_command-runner'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, check and test the new TypeScript workspace.',
  async action() {
    // Parser, app compilation, IDE build and runtime packaging await their new implementations.
    await runSteps(
      () => workspaceFormat('fmt'),
      () => workspaceTypes(),
      () => workspaceConformance(),
      () => workspaceDeadExports(),
      () => workspaceTests(),
    )
  },
})
