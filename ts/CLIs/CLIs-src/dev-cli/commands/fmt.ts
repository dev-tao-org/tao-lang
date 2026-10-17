import { runCommand } from '@cli-kit'
import { Errors } from '@shared'
import { FileSystem, Path, Repo } from '@shared/os'
import {
  assertNewWorkspacePath,
  assertNewWorkspaceTree,
  workspaceFormat,
} from '../../cli-checks/check'
import { registerCommand } from './_command-runner'

/** fmtCommand formats repository files through the shared developer command. */
export default registerCommand({
  name: 'fmt',
  description: 'Format repository files, optionally only named files or dprint globs.',
  arguments: [{ name: 'paths', description: 'Repository-relative files or dprint globs.', variadic: true }],
  async action(paths: string[]) {
    if (paths.length === 0) {
      await workspaceFormat('fmt')
      return
    }
    await assertNewWorkspaceTree()
    for (const path of paths) {
      const absolute = Repo.resolvePath(path)
      assertNewWorkspacePath(absolute)
      const isFile = FileSystem.existsSync(absolute) && FileSystem.statSync(absolute).isFile()
      if (!isFile && !/[*?\[{]/.test(path)) {
        Errors.ThrowUserInput(`Formatting requires a file or glob: ${path}`)
      }
      if (isFile && path.endsWith('.tao')) {
        Errors.ThrowUserInput('New Tao formatting awaits the parser.')
      } else if (isFile && Path.basename(absolute) === 'Justfile') {
        await runCommand('just --fmt --justfile', { variadicArgs: [absolute], cwd: Repo.getWorkspaceRoot() })
      } else {
        await runCommand(
          'dprint fmt --config .dprint.jsonc --incremental=false --excludes old-tao-v1/** --',
          { variadicArgs: [path], cwd: Repo.getWorkspaceRoot() },
        )
      }
    }
  },
})
