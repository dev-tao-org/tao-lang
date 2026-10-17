import { runCommand, runSteps } from '@cli-kit'
import {
  registerCommand,
  repositoryRoot,
  workspaceComments,
  workspaceFormat,
  workspaceTypes,
} from './_command-runner'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, check and test the new TypeScript workspace.',
  action: async () => {
    // Parser, app compilation, IDE build and runtime packaging await their new implementations.
    await runSteps(
      () => workspaceFormat('fmt'),
      () => workspaceTypes(),
      () => workspaceComments(),
      () => runCommand([process.execPath, 'test'], { cwd: `${repositoryRoot}/ts` }),
    )
  },
})
