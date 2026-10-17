import { runCommand } from '@cli-kit'
import { registerCommand, repositoryRoot, runLegacyRecipe, workspaceFormat, workspaceTypes } from './_command-runner'

/** checkCommand checks the TypeScript workspace. */
export const checkCommand = registerCommand({
  name: 'check',
  description: 'Check new workspace types and formatting, then run the complete legacy check lane.',
  arguments: [{ name: 'args', description: 'Legacy lane options, including --no-cache.', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // New parser/app/IDE/runtime gates await those implementations; retain all reference gates.
    for (
      const step of [
        () => workspaceTypes(),
        () => workspaceFormat('check'),
        () =>
          runCommand(['just', '--fmt', '--check', '--justfile', `${repositoryRoot}/Justfile`], { cwd: repositoryRoot }),
        () => runLegacyRecipe(['check', ...args]),
      ]
    ) {
      process.exitCode = await step()
      if (process.exitCode !== 0) {
        return
      }
    }
  },
})
