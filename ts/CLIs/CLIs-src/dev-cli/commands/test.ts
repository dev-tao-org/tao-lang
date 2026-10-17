import { runCommand } from '@cli-kit'
import { existsSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { legacyRoot, registerCommand, repositoryRoot, runLegacyRecipe } from './_command-runner'

/** testCommand runs the TypeScript workspace tests and preserves their verdict. */
export const testCommand = registerCommand({
  name: 'test',
  description: 'Run workspace and legacy tests; a path scopes the run and a name filters both.',
  arguments: [{ name: 'target', description: 'Test file or directory.' }],
  action: async (target?: string) => {
    // App/IDE preparation and Tao/runtime suites remain owned by the legacy test recipe.
    const path = target ? resolve(repositoryRoot, target) : undefined
    const inLegacy = path !== undefined && (path === legacyRoot || path.startsWith(`${legacyRoot}/`))
    if (inLegacy) {
      process.exitCode = await runLegacyRecipe(['test', relative(legacyRoot, path) || '.'])
      return
    }
    const workspaceTarget = target && (isAbsolute(target) || existsSync(resolve(`${repositoryRoot}/ts`, target)))
      ? target
      : path && existsSync(path)
      ? path
      : undefined
    const args = workspaceTarget ? [workspaceTarget] : target ? ['--test-name-pattern', target] : []
    const workspace = await runCommand([process.execPath, 'test', ...args], { cwd: `${repositoryRoot}/ts` })
    process.exitCode = workspace === 0 && !workspaceTarget
      ? await runLegacyRecipe(['test', ...(target ? [target] : [])])
      : workspace
  },
})
