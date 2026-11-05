import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { pushBranch } from '../push/Push'

/** pushCommand publishes one local branch through the non-main agent push guard. */
export default registerCommand({
  name: 'push',
  description: 'Push one local branch to a named remote, excluding main; no force, deletion or bulk pushes.',
  arguments: [
    { name: 'remote', required: true, description: 'Configured remote name, such as origin.' },
    { name: 'branch', required: true, description: 'Explicit destination branch; also the default local source.' },
  ],
  options: [{ flags: '--source <branch>', description: 'Local source branch when different from the destination.' }],
  async action(remote: string, branch: string, options: { source?: string }) {
    await pushBranch(remote, branch, options)
  },
})
