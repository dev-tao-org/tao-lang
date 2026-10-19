import { IO, resolveCallerPath } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Path } from '@shared/os'
import { namedPackageDirectories, recursiveSourceFiles } from '@workspace/modules/Catalog'
import {
  executeManagedTool,
  projectManagedInput,
} from '@workspace/ProjectPreparation'
import { discoverProject } from '@workspace/projects/Projects'
import { generatedModuleFiles, readManagedModules } from '@workspace/sidecars/ManagedModules'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { runSidecarTests, withProjectSessions } from '../ProjectCommand'

/** testSidecarsCommand runs tests with the selected Tao module's prepared npm profile. */
export default registerCommand({
  name: 'test-sidecars',
  description: 'Run local sidecar tests with a prepared Tao module npm profile.',
  arguments: [{ name: 'module', required: true, description: 'Local module name, such as @widgets.' }],
  options: [{ flags: '--session <id>', description: 'Use a named project session lock.' }],
  async action(moduleName: string, options: { session?: string } = {}) {
    const caller = resolveCallerPath('.')
    const project = await discoverProject(caller)
      ?? Errors.ThrowUserInput(`No Tao project was found from ${caller}. Run tao init <path>.`)
    const moduleRoot = await resolveModuleRoot(project.root, moduleName)
    const entry = await moduleEntry(moduleRoot, project.root)
    await withProjectSessions([moduleRoot, entry], async () => {
      const input = await projectManagedInput(entry)
        ?? Errors.ThrowUserInput(
          `No managed sidecar profile is reachable from ${entry}; prepare the module with tao prepare ${entry}.`,
        )
      if (!input.modules.some(module => Path.resolve(module.directory) === Path.resolve(moduleRoot))) {
        Errors.ThrowUserInput(`Module ${moduleName} has no prepared managed npm or sidecar profile.`)
      }
      await Try(() => readManagedModules(input), {
        catch: () => Errors.ThrowUserInput(`No valid prepared sidecar profile for ${entry}; run tao prepare ${entry}.`),
      })
      const drift = await generatedModuleFiles(input)
      if (drift.length > 0) {
        Errors.ThrowUserInput(
          `Generated module files are stale (${drift.map(file => file.path).join(', ')}); run tao prepare --repair.`,
        )
      }
      IO.print(`Running Bun sidecar tests for ${moduleName}`)
      await runSidecarTests(moduleRoot, executeManagedTool)
    }, options.session)
  },
})

async function resolveModuleRoot(projectRoot: string, moduleName: string): Promise<string> {
  if (!/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(moduleName)) {
    Errors.ThrowUserInput(`Expected a local Tao module name such as @widgets; received ${moduleName}.`)
  }
  const matches = await namedPackageDirectories(projectRoot, moduleName)
  if (matches.length !== 1) {
    Errors.ThrowUserInput(
      matches.length === 0
        ? `No project-owned module ${moduleName} was found in ${projectRoot}.`
        : `Module ${moduleName} is ambiguous: ${matches.join(', ')}`,
    )
  }
  return matches[0]!
}

async function moduleEntry(moduleRoot: string, projectRoot: string): Promise<string> {
  const files = (await recursiveSourceFiles(moduleRoot, moduleRoot, projectRoot))
    .sort((left, right) => depth(left) - depth(right) || left.localeCompare(right))
  if (files.length === 0) {
    Errors.ThrowUserInput(`Module ${moduleRoot} contains no Tao source entry.`)
  }
  return files[0]!
}

function depth(path: string): number {
  return path.split(/[\\/]/).length
}
