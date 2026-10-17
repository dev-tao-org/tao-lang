import { rm } from 'node:fs/promises'
import { registerCommand, repositoryRoot } from './_command-runner'

/** cleanCommand removes dependencies owned by the new workspace. */
export default registerCommand({
  name: 'clean',
  description: 'Remove the new workspace dependencies.',
  action: async () => {
    // New parser/app/IDE/native build trees do not exist yet. Preserve shared .artifacts ownership.
    await rm(`${repositoryRoot}/ts/node_modules`, { recursive: true, force: true })
  },
})
