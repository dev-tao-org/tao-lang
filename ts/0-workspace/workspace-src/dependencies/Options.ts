import { Errors } from '@shared'
import { Path } from '@shared/os'
import * as Stdlib from '@stdlib/Stdlib'
import { gitSourceAdapter } from './Git'
import { readProjectRequirements } from './Requirements'
import { defaultSourceAlias } from './Sources'
import type { DependencyRequirement, DependencyStoreOptions } from './Types'

/** projectDependencyOptions assembles the normal Tao source dependency services. */
export async function projectDependencyOptions(projectRoot: string): Promise<DependencyStoreOptions> {
  const standardProject = await Stdlib.projectDirectory()
  return {
    storeRoot: Path.join(projectRoot, '.tao', 'cache', 'dependencies'),
    bundledProjects: { tao: standardProject },
    readRequirements: root => requirementsWithStandardProject(root, standardProject),
    git: gitSourceAdapter,
  }
}

async function requirementsWithStandardProject(
  root: string,
  standardProject: string,
): Promise<DependencyRequirement[]> {
  const requirements = await readProjectRequirements(root)
  if (Path.resolve(root) === Path.resolve(standardProject)) {
    return requirements
  }
  const standardAlias = requirements.find(item => (item.alias ?? defaultSourceAlias(item)) === 'tao')
  if (standardAlias) {
    if (standardAlias.provider !== 'bundled' || standardAlias.identifier !== 'tao') {
      Errors.ThrowUserInput('Dependency alias tao belongs to the bundled Tao project. Choose another alias with as.')
    }
    return requirements
  }
  return [{ provider: 'bundled', identifier: 'tao', version: 'bundled' }, ...requirements]
}
