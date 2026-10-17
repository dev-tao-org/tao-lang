import { runCommand, runSteps } from '@cli-kit'
import { Errors } from '@shared'
import { existsSync, statSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'
import { legacyRoot, registerCommand, repositoryRoot, runLegacyRecipe, workspaceFormat } from './_command-runner'

/** fmtCommand formats repository files through the shared developer command. */
export const fmtCommand = registerCommand({
  name: 'fmt',
  description: 'Format repository files, optionally only named files or dprint globs.',
  arguments: [{ name: 'paths', description: 'Repository-relative files or dprint globs.', variadic: true }],
  action: async (paths: string[]) => {
    if (paths.length === 0) {
      // New Tao formatting awaits its parser. The reference fmt recipe retains parser generation,
      // Tao formatting, template checks and its own Justfile formatting.
      process.exitCode = await runSteps([
        () => workspaceFormat('fmt'),
        () => runLegacyRecipe(['fmt']),
      ])
      return
    }
    for (const path of paths) {
      const absolute = resolve(repositoryRoot, path)
      const isFile = existsSync(absolute) && statSync(absolute).isFile()
      if (!isFile && !/[*?\[{]/.test(path)) {
        console.error(`Formatting requires a file or glob: ${path}`)
        process.exitCode = 2
        return
      }
      if (isFile && path.endsWith('.tao')) {
        if (!absolute.startsWith(`${legacyRoot}/`)) {
          Errors.ThrowUserInput('New Tao formatting awaits the parser; use a file inside old-tao-v1 for now.')
        }
        process.exitCode = await runLegacyRecipe(['fmt', relative(legacyRoot, absolute)])
      } else if (isFile && basename(absolute) === 'Justfile') {
        process.exitCode = await runCommand(['just', '--fmt', '--justfile', absolute], { cwd: repositoryRoot })
      } else {
        process.exitCode = await runCommand(
          ['dprint', 'fmt', '--config', '.dprint.jsonc', '--incremental=false', path],
          { cwd: repositoryRoot },
        )
      }
      if (process.exitCode !== 0) {
        return
      }
    }
  },
})
