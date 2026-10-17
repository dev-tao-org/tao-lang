import { runCommand } from '@cli-kit'
import { fileURLToPath } from 'node:url'
import { registerCommand } from './_command-runner'

const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url))

/** fmtCommand formats repository files through the shared developer command. */
export const fmtCommand = registerCommand('fmt')
  .description('Format repository files, optionally only named files or dprint globs.')
  .argument('[paths...]', 'Repository-relative files or dprint globs.')
  .action(async (paths: string[]) => {
    process.exitCode = await runCommand([
      'dprint',
      'fmt',
      '--config',
      '.dprint.jsonc',
      '--incremental=false',
      ...(paths.length > 0 ? paths : ['**/*']),
    ], { cwd: repositoryRoot })
  })
