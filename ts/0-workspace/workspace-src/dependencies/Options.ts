import { UserInput } from '@shared'
import { Path } from '@shared/os'
import * as Stdlib from '@stdlib'
import { gitSourceAdapter } from './Git'
import { readProjectRequirements } from './Requirements'
import { deriveDefaultSourceAlias } from './Sources'
import type { DependencyRequirement, DependencyStoreOptions } from './Types'

/** createProjectDependencyOptions assembles Tao source dependency services. */
export async function createProjectDependencyOptions(projectRoot: string): Promise<DependencyStoreOptions> {
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
  const standardAlias = requirements.find(item => (item.alias ?? deriveDefaultSourceAlias(item)) === 'tao')
  if (standardAlias) {
    UserInput.require(
      !(standardAlias.provider !== 'bundled' || standardAlias.identifier !== 'tao'),
      'Dependency alias tao belongs to the bundled Tao project. Choose another alias with as.',
    )
    return requirements
  }
  return [{ provider: 'bundled', identifier: 'tao', version: 'bundled' }, ...requirements]
}
