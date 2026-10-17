import { registerCommand, workspaceFormat } from './_command-runner'

/** fixCommand applies the available new-workspace fixes. */
export default registerCommand({
  name: 'fix',
  description: 'Apply new workspace and shared repository formatting fixes.',
  async action() {
    // Tao source fixes and import cleanup await their new parser/tooling implementations.
    await workspaceFormat('fmt')
  },
})
