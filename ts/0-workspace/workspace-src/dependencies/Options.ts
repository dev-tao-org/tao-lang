import { Path } from '@shared/os'
import * as Stdlib from '@stdlib/Stdlib'
import { gitSourceAdapter } from './Git'
import { readProjectRequirements } from './Requirements'
import type { DependencyStoreOptions } from './Types'

/** projectDependencyOptions assembles the normal Tao source dependency services. */
export function projectDependencyOptions(projectRoot: string): DependencyStoreOptions {
  return {
    storeRoot: Path.join(projectRoot, '.tao', 'cache', 'dependencies'),
    bundledRoot: Stdlib.directory ? Path.join(Stdlib.directory, '@tao') : undefined,
    readRequirements: readProjectRequirements,
    git: gitSourceAdapter,
  }
}
