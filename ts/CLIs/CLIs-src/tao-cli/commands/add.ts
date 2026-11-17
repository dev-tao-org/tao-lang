import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'
import { UserInput } from '@shared'
import * as Workspace from '@workspace'

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
    UserInput.Require(!!options.npm, 'tao add requires --npm <package>.')
    const caller = CLIKit.resolveCallerPath('.')
    const project = await Workspace.discoverProject(caller)
    if (!project) {
      UserInput.Fail(`No Tao project was found from ${caller}. Run tao init <path>.`)
    }
    await Workspace.withDependencySession(project.root, options.session, async () => {
      UserInput.Require(
        !(!options.yes && !await IO.askConfirm({
          message: `Resolve and prepare ${options.npm} for ${moduleName}?`,
          defaultValue: false,
        })),
        'Dependency addition was declined; rerun with --yes to proceed non-interactively.',
      )
      const added = await Workspace.addModuleNpmDependency(project.root, moduleName, options.npm!)
      IO.print(`Added npm:${added.packageName}@${added.version} to ${added.sourcePath}`)
      await Workspace.prepareProject(added.sourcePath)
    })
  },
})
