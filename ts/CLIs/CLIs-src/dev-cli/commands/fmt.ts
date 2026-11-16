import * as CLIKit from '@cli-kit'
import { Errors, Regxs } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import * as Check from '../../cli-checks/check'
import { updateTaoSource } from '../source/TaoSource'
import { registerCommand } from './_command-runner'

/** fmtCommand formats repository files through the shared developer command. */
export default registerCommand({
  name: 'fmt',
  description: 'Format repository files, optionally only named files or dprint globs.',
  arguments: [{ name: 'paths', description: 'Repository-relative files or dprint globs.', variadic: true }],
  async action(paths: string[]) {
    if (paths.length === 0) {
      await Check.workspaceFormat('fmt')
      return
    }
    await Check.assertNewWorkspaceTree()
    for (const path of paths) {
      const absolute = Repo.resolvePath(path)
      Check.assertNewWorkspacePath(absolute)
      const isFile = FS.existsSync(absolute) && FS.statSync(absolute).isFile()
      if (!isFile && !Regxs.CliGlobTokenRegx.test(path)) {
        Errors.ThrowUserInput(`Formatting requires a file or glob: ${path}`)
      }
      if (isFile && path.endsWith('.tao')) {
        await updateTaoSource(absolute, 'format')
      } else if (isFile && Path.basename(absolute) === 'Justfile') {
        await CLIKit.runNonInteractiveCommand('just', ['--fmt', '--justfile', absolute], {
          cwd: Repo.getWorkspaceRoot(),
        })
      } else {
        await CLIKit.runNonInteractiveCommand(
          'dprint',
          ['fmt', '--config', '.dprint.jsonc', '--incremental=false', '--excludes', '.x-tao-old-v1/**', '--', path],
          { cwd: Repo.getWorkspaceRoot() },
        )
      }
    }
  },
})
