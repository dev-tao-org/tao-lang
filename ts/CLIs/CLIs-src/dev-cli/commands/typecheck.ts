import { registerCommand, workspaceTypes } from './_command-runner'

/** typecheckCommand checks the TypeScript workspace types. */
export default registerCommand({
  name: 'typecheck',
  description: 'Check TypeScript workspace types.',
  action: async () => {
    await workspaceTypes()
  },
})
