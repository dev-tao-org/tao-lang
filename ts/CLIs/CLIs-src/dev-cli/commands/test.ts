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
    if (isLegacyTestTarget(path)) {
      process.exitCode = await runLegacyRecipe(['test', relative(legacyRoot, path) || '.'])
      return
    }
    const workspaceTarget = workspaceTestTarget(target)
    const args = workspaceTarget ? [workspaceTarget] : target ? ['--test-name-pattern', target] : []
    const workspace = await runCommand([process.execPath, 'test', ...args], { cwd: `${repositoryRoot}/ts` })
    process.exitCode = workspace === 0 && !workspaceTarget
      ? await runLegacyRecipe(['test', ...(target ? [target] : [])])
      : workspace
  },
})

function workspaceTestTarget(target: string | undefined): string | undefined {
  if (!target) {
    return undefined
  }
  if (isAbsolute(target) || existsSync(resolve(`${repositoryRoot}/ts`, target))) {
    return target
  }
  const path = resolve(repositoryRoot, target)
  return existsSync(path) ? path : undefined
}

function isLegacyTestTarget(path: string | undefined): path is string {
  return path !== undefined && (path === legacyRoot || path.startsWith(`${legacyRoot}/`))
}
