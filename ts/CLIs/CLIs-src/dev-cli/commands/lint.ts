import { registerCommand, runLegacyRecipe } from './_command-runner'

/** lintCommand runs the retained repository rules. */
export default registerCommand({
  name: 'lint',
  description: 'Run the reference repository lint.',
  action: async () => {
    // Parser/app/IDE-specific lint rules still target old-tao-v1; new equivalents await those parts.
    return await runLegacyRecipe(['lint'])
  },
})
