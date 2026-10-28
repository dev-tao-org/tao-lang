import { IO, resolveCallerPath } from '@cli-kit'
import { Errors, Regxs } from '@shared'
import { Path } from '@shared/os'
import { readProjectRequirements } from '@workspace/dependencies/Requirements'
import { findPreparationEntry, listDependencyWork, withDependencySession } from '@workspace/ModuleDependencies'
import { prepareProject } from '@workspace/ProjectPreparation'
import { discoverProject } from '@workspace/projects/Projects'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { confirmDependencyWork } from '../DependencyPrompts'

type UpdateCommandOptions = { entry?: string; yes?: boolean; session?: string }
type OptionalDependencyAlias = string | undefined
/** taoUpdateCommand refreshes selected source pins while retaining unrelated lock entries. */
export default registerCommand({
  name: 'update',
  description: 'Update selected Tao source dependency pins.',
  arguments: [{ name: 'alias', description: 'One direct source dependency alias; default updates all.' }],
  options: [
    { flags: '--entry <file>', description: 'Tao app or module entry; inferred when unambiguous.' },
    { flags: '--yes', description: 'Confirm dependency downloads.' },
    { flags: '--session <id>', description: 'Use a named project session lock.' },
  ],
  async action(alias: OptionalDependencyAlias, options: UpdateCommandOptions = {}) {
    const target = resolveCallerPath(options.entry ?? '.')
    const project = await discoverProject(target)
      ?? Errors.ThrowUserInput(`No Tao project was found from ${target}. Run tao init <path>.`)
    const requirements = await readProjectRequirements(project.root)
    const aliases = requirements.map(requirement => requirement.alias ?? defaultAlias(requirement))
    const update = alias ? [alias] : aliases
    if (alias && !aliases.includes(alias)) {
      Errors.ThrowUserInput(`No direct source dependency alias ${alias} was found in ${project.root}.`)
    }
    if (update.length === 0) {
      Errors.ThrowUserInput(`No direct source dependencies are declared in ${project.root}.`)
    }
    const selected = await findPreparationEntry(project.root, options.entry ? target : undefined)
    await withDependencySession(project.root, options.session, async () => {
      const work = await listDependencyWork(project.root)
      await confirmDependencyWork([`update ${update.join(', ')}`, ...work], options.yes === true)
      IO.print(`Updating source dependencies: ${update.join(', ')}`)
      await prepareProject(selected, { update })
    })
  },
})

function defaultAlias(requirement: { provider: string; identifier: string }): string {
  return requirement.provider === 'github'
    ? requirement.identifier.replace(Regxs.GitSuffixRegx, '').split('/').at(-1)!
    : Path.basename(requirement.identifier.replaceAll('\\', '/'))
}
