import { FileSystem, Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

/** cleanCommand removes dependencies owned by the new workspace. */
export default registerCommand({
  name: 'clean',
  description: 'Remove the new workspace dependencies.',
  async action() {
    // New parser/app/IDE/native build trees do not exist yet. Preserve shared .artifacts ownership.
    await FileSystem.rm(Repo.resolvePath('ts/node_modules'), { recursive: true, force: true })
  },
})
