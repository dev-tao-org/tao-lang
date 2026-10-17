import { runSteps } from '@cli-kit'
import { registerCommand, runLegacyRecipe, workspaceFormat, workspaceTypes } from './_command-runner'

/** checkCommand checks the TypeScript workspace. */
export const checkCommand = registerCommand({
  name: 'check',
  description: 'Check new workspace types and formatting, then run the complete legacy check lane.',
  arguments: [{ name: 'args', description: 'Legacy lane options, including --no-cache.', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // New parser/app/IDE/runtime gates await those implementations; retain all reference gates.
    process.exitCode = await runSteps([
      () => workspaceTypes(),
      () => workspaceFormat('check'),
      () => runLegacyRecipe(['check', ...args]),
    ])
  },
})
