import { runCommand } from '@cli-kit'
import { registerCommand, repositoryRoot, runLegacyRecipe, workspaceFormat, workspaceTypes } from './_command-runner'

/** verifyCommand verifies the new workspace and the full ordinary reference lane. */
export const verifyCommand = registerCommand({
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
    for (
      const step of [
        () => workspaceFormat('fmt'),
        () => runCommand(['just', '--fmt', '--justfile', `${repositoryRoot}/Justfile`], { cwd: repositoryRoot }),
        () => workspaceTypes(),
        () => runCommand([process.execPath, 'test'], { cwd: `${repositoryRoot}/ts` }),
        () => runLegacyRecipe(['verify', ...args]),
      ]
    ) {
      process.exitCode = await step()
      if (process.exitCode !== 0) {
        return
      }
    }
  },
})
