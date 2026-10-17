import { registerCommand, workspaceComments } from './_command-runner'

/** checkCommentsCommand checks exported function JSDoc in the TypeScript workspace. */
export default registerCommand({
  name: 'check-comments',
  description: 'Quickly check exported TypeScript functions for name-led JSDoc.',
  action: async () => await workspaceComments(),
})
