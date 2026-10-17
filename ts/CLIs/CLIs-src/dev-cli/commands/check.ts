import { runSteps } from '@cli-kit'
import { registerCommand, runLegacyRecipe, workspaceComments, workspaceFormat, workspaceTypes } from './_command-runner'

/** checkCommand checks the TypeScript workspace. */
export default registerCommand({
  name: 'check',
  description: 'Check new workspace types and formatting, then run the complete legacy check lane.',
  arguments: [{ name: 'args', description: 'Legacy lane options, including --no-cache.', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // New parser/app/IDE/runtime gates await those implementations; retain all reference gates.
    return await runSteps([
      () => workspaceTypes(),
      () => workspaceComments(),
      () => workspaceFormat('check'),
      () => runLegacyRecipe(['check', ...args]),
    ])
  },
})
