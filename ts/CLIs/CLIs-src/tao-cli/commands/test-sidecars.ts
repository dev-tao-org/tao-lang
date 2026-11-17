import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'
import { Regxs, UserInput } from '@shared'
import * as Workspace from '@workspace'

import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { withProjectSessions } from '../ProjectCommand'
import { workflowUI } from '../WorkflowUI'

/** testSidecarsCommand runs tests with the selected Tao module's prepared npm profile. */
export default registerCommand({
  name: 'test-sidecars',
  description: 'Run local sidecar tests with a prepared Tao module npm profile.',
  arguments: [{ name: 'module', required: true, description: 'Local module name, such as @widgets.' }],
  options: [
    { flags: '--session <id>', description: 'Use a named project session lock.' },
    { flags: '--yes', description: 'Authorize required dependency setup.' },
  ],
  async action(moduleName: string, options: { session?: string; yes?: boolean } = {}) {
    const caller = CLIKit.resolveCallerPath('.')
    const project = await Workspace.discoverProject(caller)
    if (!project) {
      UserInput.Fail(`No Tao project was found from ${caller}. Run tao init <path>.`)
    }
    const moduleRoot = await resolveModuleRoot(project.root, moduleName)
    const entry = await findModuleEntry(moduleRoot, project.root)
    await withProjectSessions([moduleRoot, entry], async () => {
      IO.print(`Running Bun sidecar tests for ${moduleName}`)
      await Workspace.execute(
        { kind: 'sidecar-tests', entry, moduleRoot, executor: Workspace.executeManagedTool },
        workflowUI(options.yes),
      )
    }, options.session)
  },
})

async function resolveModuleRoot(projectRoot: string, moduleName: string): Promise<string> {
  if (!Regxs.ModuleNameRegx.test(moduleName)) {
    UserInput.Fail(`Expected a local Tao module name such as @widgets; received ${moduleName}.`)
  }
  const matches = await Workspace.findNamedPackageDirectories(projectRoot, moduleName)
  if (matches.length !== 1) {
    UserInput.Fail(
      matches.length === 0
        ? `No project-owned module ${moduleName} was found in ${projectRoot}.`
        : `Module ${moduleName} is ambiguous: ${matches.join(', ')}`,
    )
  }
  return matches[0]!
}

async function findModuleEntry(moduleRoot: string, projectRoot: string): Promise<string> {
  const files = (await Workspace.listRecursiveSourceFiles(moduleRoot, moduleRoot, projectRoot))
    .sort((left, right) => getPathDepth(left) - getPathDepth(right) || left.localeCompare(right))
  if (files.length === 0) {
    UserInput.Fail(`Module ${moduleRoot} contains no Tao source entry.`)
  }
  return files[0]!
}

function getPathDepth(path: string): number {
  return path.split(Regxs.PathSeparatorRegx).length
}
