import { Errors } from '@shared'
import { FileSystem, Repo } from '@shared/os'
import { assertNewWorkspacePath, workspaceFormat } from '../../cli-checks/check'
import { updateTaoSource } from '../source/TaoSource'
import { registerCommand } from './_command-runner'

/** fixCommand applies the available new-workspace fixes. */
export default registerCommand({
  name: 'fix',
  description: 'Fix and format named Tao source files, or format repository files when no paths are given.',
  arguments: [{ name: 'paths', description: 'Repository-relative Tao source files.', variadic: true }],
  async action(paths: string[]) {
    if (paths.length === 0) {
      await workspaceFormat('fmt')
      return
    }
    for (const path of paths) {
      const absolute = Repo.resolvePath(path)
      assertNewWorkspacePath(absolute)
      if (!path.endsWith('.tao') || !FileSystem.statSync(absolute).isFile()) {
        Errors.ThrowUserInput(`Fixing requires a Tao source file: ${path}`)
      }
      await updateTaoSource(absolute, 'fix')
    }
  },
})
