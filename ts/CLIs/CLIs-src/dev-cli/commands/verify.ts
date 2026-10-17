import { runCommand, runSteps } from '@cli-kit'
import {
  registerCommand,
  repositoryRoot,
  runLegacyRecipe,
  workspaceComments,
  workspaceFormat,
  workspaceTypes,
} from './_command-runner'

/** verifyCommand verifies the new workspace and the full ordinary reference lane. */
export default registerCommand({
  name: 'verify',
  description: 'Check and test the new workspace, then run the complete legacy verify lane.',
  arguments: [{
    name: 'args',
    description: 'Legacy lane options, including --no-cache and --complete.',
    variadic: true,
  }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // Parser, app compilation, IDE build, Tao checks and runtime packaging remain in the legacy
    // lane until their new implementations exist. Preserve its fixer graph and host-gate exclusions.
    return await runSteps([
      () => workspaceFormat('fmt'),
      () => workspaceTypes(),
      () => workspaceComments(),
      () => runCommand([process.execPath, 'test'], { cwd: `${repositoryRoot}/ts` }),
      () => runLegacyRecipe(['verify', ...args]),
    ])
  },
})
