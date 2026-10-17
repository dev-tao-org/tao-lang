import { registerCommand, workspaceConformance } from './_command-runner'

/** checkCommentsCommand checks API docs and exception/comment syntax in the new workspace. */
export default registerCommand({
  name: 'check-comments',
  description: 'Quickly check exported API JSDoc, private comments and Try usage.',
  action: async () => await workspaceConformance(),
})
