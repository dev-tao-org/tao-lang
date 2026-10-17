import { runSteps } from '@cli-kit'
import { registerCommand, runLegacyRecipe, workspaceFormat } from './_command-runner'

/** fixCommand applies shared formatting and the complete reference fix workflow. */
export const fixCommand = registerCommand({
  name: 'fix',
  description: 'Apply repository formatting and all legacy Tao source fixes.',
  action: async () => {
    // New Tao source fixes await the parser/tooling implementation; keep parser generation and
    // Tao fixes in the reference recipe, including its template check and Justfile formatting.
    process.exitCode = await runSteps([
      () => workspaceFormat('fmt'),
      () => runLegacyRecipe(['fix']),
    ])
  },
})
