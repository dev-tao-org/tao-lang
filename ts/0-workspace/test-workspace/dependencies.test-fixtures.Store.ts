import { FS, Path } from '@shared/os'
import type { DependencyRequirement, DependencyStoreOptions } from '../workspace-src/dependencies/Types'

/** createGitDependencyFixtureOptions builds controlled Git source preparation dependencies. */
export function createGitDependencyFixtureOptions(
  root: string,
  commits: Map<string, string>,
  calls: string[],
): DependencyStoreOptions {
  return {
    storeRoot: Path.join(root, 'cache'),
    readRequirements: async () => [],
    acquireLock: async () => ({ release() {} }),
    git: {
      async resolveCommit(repository, version) {
        const key = `${repository.split('/').slice(-2).join('/').replace('.git', '')}:${version}`
        calls.push(`resolve:${key}`)
        return commits.get(key)!
      },
      async fetchCommit(_repository, commit, destination) {
        calls.push(`fetch:${commit}`)
        await FS.mkdir(destination)
        await createProjectMarker(destination)
      },
    },
  }
}

/** createGithubRequirement creates a GitHub dependency declaration for store tests. */
export function createGithubRequirement(identifier: string, version = 'main'): DependencyRequirement {
  return { provider: 'github', identifier, version }
}

/** createProjectMarker creates Tao's project marker in a prepared source fixture. */
export async function createProjectMarker(root: string): Promise<void> {
  await FS.mkdir(Path.join(root, '.tao'))
}
