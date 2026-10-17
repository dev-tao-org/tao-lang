import { registerCommand, runLegacyRecipe, workspaceTypes } from './_command-runner'

/** typecheckCommand checks the TypeScript workspace types. */
export default registerCommand({
  name: 'typecheck',
  description: 'Check TypeScript workspace types.',
  action: async () => {
    const workspace = await workspaceTypes()
    return workspace === 0 ? await runLegacyRecipe(['_typecheck']) : workspace
  },
})
