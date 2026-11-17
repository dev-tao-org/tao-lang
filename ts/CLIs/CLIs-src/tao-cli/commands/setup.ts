import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'
import { UserInput } from '@shared'
import * as Workspace from '@workspace'

import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { workflowUI } from '../WorkflowUI'

type SetupCommandOptions = { yes?: boolean; repair?: boolean; session?: string }
type OptionalSetupEntry = string | undefined
/** taoSetupCommand installs dependencies reachable from one entry after consent. */
export default registerCommand({
  name: 'setup',
  description: 'Set up source and npm dependencies for a Tao project.',
  arguments: [{ name: 'entry', description: 'Tao app or module entry; inferred when unambiguous.' }],
  options: [
    { flags: '--yes', description: 'Confirm dependency downloads.' },
    { flags: '--repair', description: 'Repair generated dependency files before preparation.' },
    { flags: '--session <id>', description: 'Use a named project session lock.' },
  ],
  async action(entry: OptionalSetupEntry, options: SetupCommandOptions = {}) {
    const target = CLIKit.resolveCallerPath(entry ?? '.')
    const project = await Workspace.discoverProject(target)
    if (!project) {
      UserInput.Fail(`No Tao project was found from ${target}. Run tao init <path>.`)
    }
    const selected = await Workspace.findPreparationEntry(project.root, entry ? target : undefined)
    await Workspace.withDependencySession(project.root, options.session, async () => {
      IO.print(`Setting up dependencies for ${selected}`)
      await Workspace.execute(
        { kind: 'setup', entry: selected, preparation: { repair: options.repair } },
        workflowUI(options.yes),
      )
    })
  },
})
