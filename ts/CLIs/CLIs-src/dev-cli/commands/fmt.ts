import { Repo } from '@shared/os'
import { workspaceFormat } from '../../cli-checks/workspace-format'
import { registerCommand } from './_command-runner'

/** fmtCommand formats repository files through the shared developer command. */
export default registerCommand({
  name: 'fmt',
  description: 'Format repository files, optionally only named files or dprint globs.',
  arguments: [{ name: 'paths', description: 'Repository-relative files or dprint globs.', variadic: true }],
  async action(paths: string[]) {
    await workspaceFormat('fmt', Repo.getWorkspaceRoot(), { paths })
  },
})
