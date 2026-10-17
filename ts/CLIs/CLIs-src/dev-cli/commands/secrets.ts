import { registerCommand, runLegacyRecipe } from './_command-runner'

/** secretsCommand preserves the existing encrypted secrets workflow. */
export default registerCommand({
  name: 'secrets',
  description: 'Decrypt or manage reference repository secrets.',
  arguments: [{ name: 'args', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // The encrypted store and legacy app environment are retained until new apps need secrets.
    await runLegacyRecipe(['secrets', ...args])
  },
})
