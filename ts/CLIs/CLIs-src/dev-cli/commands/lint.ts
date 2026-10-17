import { registerCommand, workspaceConformance } from './_command-runner'

/** lintCommand runs the available new-workspace source rules. */
export default registerCommand({
  name: 'lint',
  description: 'Check exported API JSDoc, private comments and Try usage in the new workspace.',
  action: async () => {
    // Parser/app/IDE-specific rules await their new implementations.
    await workspaceConformance()
  },
})
