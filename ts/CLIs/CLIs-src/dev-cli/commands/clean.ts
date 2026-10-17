import { rm } from 'node:fs/promises'
import { registerCommand, repositoryRoot, runLegacyRecipe } from './_command-runner'

/** cleanCommand retains the reference cleanup plan and scratch ownership guards. */
export default registerCommand({
  name: 'clean',
  description: 'Clean reference dependencies and build artifacts using its ownership guards.',
  action: async () => {
    // New parser/app/IDE/native build trees do not exist yet. Keep the reference removal plan,
    // including clean-scratch; never recursively remove the shared root .artifacts directory.
    const code = await runLegacyRecipe(['clean'])
    if (code === 0) {
      await rm(`${repositoryRoot}/ts/node_modules`, { recursive: true, force: true })
    }
    return code
  },
})
