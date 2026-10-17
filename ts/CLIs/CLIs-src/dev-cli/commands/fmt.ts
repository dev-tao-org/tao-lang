import { runCommand } from '@cli-kit'
import { Errors } from '@shared'
import { existsSync, statSync } from '@shared/os/FileSystem'
import { basename, resolve } from '@shared/os/Path'
import {
  assertNewWorkspacePath,
  assertNewWorkspaceTree,
  registerCommand,
  repositoryRoot,
  workspaceFormat,
} from './_command-runner'

/** fmtCommand formats repository files through the shared developer command. */
export default registerCommand({
  name: 'fmt',
  description: 'Format repository files, optionally only named files or dprint globs.',
  arguments: [{ name: 'paths', description: 'Repository-relative files or dprint globs.', variadic: true }],
  action: async (paths: string[]) => {
    if (paths.length === 0) {
      await workspaceFormat('fmt')
      return
    }
    await assertNewWorkspaceTree()
    for (const path of paths) {
      const absolute = resolve(repositoryRoot, path)
      assertNewWorkspacePath(absolute)
      const isFile = existsSync(absolute) && statSync(absolute).isFile()
      if (!isFile && !/[*?\[{]/.test(path)) {
        Errors.ThrowUserInput(`Formatting requires a file or glob: ${path}`)
      }
      if (isFile && path.endsWith('.tao')) {
        Errors.ThrowUserInput('New Tao formatting awaits the parser.')
      } else if (isFile && basename(absolute) === 'Justfile') {
        await runCommand(['just', '--fmt', '--justfile', absolute], { cwd: repositoryRoot })
      } else {
        await runCommand(
          ['dprint', 'fmt', '--config', '.dprint.jsonc', '--incremental=false', path, '--excludes', 'old-tao-v1/**'],
          { cwd: repositoryRoot },
        )
      }
    }
  },
})
