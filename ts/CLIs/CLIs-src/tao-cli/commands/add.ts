import { IO, resolveCallerPath } from '@cli-kit'
import { Errors } from '@shared'
import { addModuleNpmDependency, withDependencySession } from '@workspace/ModuleDependencies'
import { prepareProject } from '@workspace/ProjectPreparation'
import { discoverProject } from '@workspace/projects/Projects'
import { registerCommand } from '../../dev-cli/commands/_command-runner'

type AddCommandOptions = { npm?: string; yes?: boolean; session?: string }
/** taoAddCommand adds an exact npm requirement to a project-owned local module. */
export default registerCommand({
  name: 'add',
  description: 'Add an npm dependency to a local Tao module.',
  arguments: [{ name: 'module', required: true, description: 'Local module name, such as @widgets.' }],
  options: [
    { flags: '--npm <package>', description: 'npm package or package@exact-version.' },
    { flags: '--yes', description: 'Confirm registry lookup and dependency preparation.' },
    { flags: '--session <id>', description: 'Use a named project session lock.' },
  ],
  async action(moduleName: string, options: AddCommandOptions = {}) {
    if (!options.npm) {
      Errors.ThrowUserInput('tao add requires --npm <package>.')
    }
    const caller = resolveCallerPath('.')
    const project = await discoverProject(caller)
    if (!project) {
      Errors.ThrowUserInput(`No Tao project was found from ${caller}. Run tao init <path>.`)
    }
    await withDependencySession(project.root, options.session, async () => {
      if (
        !options.yes && !await IO.askConfirm({
          message: `Resolve and prepare ${options.npm} for ${moduleName}?`,
          defaultValue: false,
        })
      ) {
        Errors.ThrowUserInput('Dependency addition was declined; rerun with --yes to proceed non-interactively.')
      }
      const added = await addModuleNpmDependency(project.root, moduleName, options.npm!)
      IO.print(`Added npm:${added.packageName}@${added.version} to ${added.sourcePath}`)
      await prepareProject(added.sourcePath)
    })
  },
})
