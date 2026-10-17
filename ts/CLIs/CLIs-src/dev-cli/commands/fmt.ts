import { IO, runCommand, runSteps } from '@cli-kit'
import { Errors } from '@shared'
import { existsSync, statSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'
import { legacyRoot, registerCommand, repositoryRoot, runLegacyRecipe, workspaceFormat } from './_command-runner'

/** fmtCommand formats repository files through the shared developer command. */
export default registerCommand({
  name: 'fmt',
  description: 'Format repository files, optionally only named files or dprint globs.',
  arguments: [{ name: 'paths', description: 'Repository-relative files or dprint globs.', variadic: true }],
  action: async (paths: string[]) => {
    if (paths.length === 0) {
      // New Tao formatting awaits its parser. The reference fmt recipe retains parser generation,
      // Tao formatting, template checks and its own Justfile formatting.
      return await runSteps([
        () => workspaceFormat('fmt'),
        () => runLegacyRecipe(['fmt']),
      ])
    }
    for (const path of paths) {
      const absolute = resolve(repositoryRoot, path)
      const isFile = existsSync(absolute) && statSync(absolute).isFile()
      if (!isFile && !/[*?\[{]/.test(path)) {
        IO.error(`Formatting requires a file or glob: ${path}`)
        return 2
      }
      let code: number
      if (isFile && path.endsWith('.tao')) {
        if (!absolute.startsWith(`${legacyRoot}/`)) {
          Errors.ThrowUserInput('New Tao formatting awaits the parser; use a file inside old-tao-v1 for now.')
        }
        code = await runLegacyRecipe(['fmt', relative(legacyRoot, absolute)])
      } else if (isFile && basename(absolute) === 'Justfile') {
        code = await runCommand(['just', '--fmt', '--justfile', absolute], { cwd: repositoryRoot })
      } else {
        code = await runCommand(
          ['dprint', 'fmt', '--config', '.dprint.jsonc', '--incremental=false', path],
          { cwd: repositoryRoot },
        )
      }
      if (code !== 0) {
        return code
      }
    }
  },
})
