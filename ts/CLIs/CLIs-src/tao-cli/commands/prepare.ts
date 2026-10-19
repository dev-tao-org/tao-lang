import { IO, resolveCallerPath } from '@cli-kit'
import { Errors } from '@shared'
import {
  findPreparationEntry,
  listDependencyWork,
  withDependencySession,
} from '@workspace/ModuleDependencies'
import { prepareProject } from '@workspace/ProjectPreparation'
import { discoverProject } from '@workspace/projects/Projects'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { confirmDependencyWork } from '../DependencyPrompts'

/** taoPrepareCommand resolves and installs the dependencies reachable from one entry. */
export default registerCommand({
  name: 'prepare',
  description: 'Prepare source and npm dependencies for a Tao project.',
  arguments: [{ name: 'entry', description: 'Tao app or module entry; inferred when unambiguous.' }],
  options: [
    { flags: '--yes', description: 'Confirm dependency downloads.' },
    { flags: '--repair', description: 'Repair generated dependency files before preparation.' },
    { flags: '--session <id>', description: 'Use a named project session lock.' },
  ],
  async action(entry: string | undefined, options: { yes?: boolean; repair?: boolean; session?: string } = {}) {
    const target = resolveCallerPath(entry ?? '.')
    const project = await discoverProject(target)
      ?? Errors.ThrowUserInput(`No Tao project was found from ${target}. Run tao init <path>.`)
    const selected = await findPreparationEntry(project.root, entry ? target : undefined)
    await withDependencySession(project.root, options.session, async () => {
      await confirmDependencyWork(await listDependencyWork(project.root), options.yes === true)
      IO.print(`Preparing dependencies for ${selected}`)
      await prepareProject(selected, { repair: options.repair })
    })
  },
})
