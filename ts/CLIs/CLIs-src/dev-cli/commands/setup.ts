import { installWorkspace } from '../../../../shared/shared-src/os/Tooling/Bootstrap'
import { registerCommand } from './_command-runner'

/** setupCommand installs the TypeScript development workspace dependencies. */
export default registerCommand({
  name: 'setup',
  description: 'Install the TypeScript development workspace dependencies from the frozen lockfile.',
  async action() {
    await installWorkspace('./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts')
  },
})
