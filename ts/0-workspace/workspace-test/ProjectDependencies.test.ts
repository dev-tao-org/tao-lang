import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import type { DependencyRequirement, DependencyStoreOptions } from '../workspace-src/dependencies/Types'
import { ProjectDependencies } from '../workspace-src/ProjectDependencies'

Tests.test('active dependency graphs require restart when authored requirements change', async () => {
  const root = Artifacts.resolvePath('tmp', `project-dependencies-${Platform.randomUUID()}`)
  const first = Path.join(root, 'first')
  const second = Path.join(root, 'second')
  let requirements: DependencyRequirement[] = [fileRequirement('./first')]
  const options: DependencyStoreOptions = {
    readRequirements: async path => Path.resolve(path) === Path.resolve(root) ? requirements : [],
    git: {
      async resolveCommit() {
        throw new Error('unexpected Git resolution')
      },
      async fetchCommit() {
        throw new Error('unexpected Git fetch')
      },
    },
  }
  await Try(async () => {
    await createProject(root)
    await createProject(first)
    await createProject(second)
    await prepareDependencies(root, requirements, options)
    const dependencies = new ProjectDependencies(root, options)
    await dependencies.refresh()
    await dependencies.refresh()
    Tests.expect(dependencies.sourceDirectories()).toEqual([first])

    requirements = [fileRequirement('./second')]
    await Tests.rejects(dependencies.refresh(), /Dependency graph changed\. Run tao prepare, then restart preview\./)
    Tests.expect(dependencies.sourceDirectories()).toEqual([first])
    Tests.expect(await dependencies.resolveProject(Path.join(root, 'Main.tao'), 'local')).toEqual({ root: first })

    requirements = [fileRequirement('./first')]
    await dependencies.refresh()
    Tests.expect(dependencies.sourceDirectories()).toEqual([first])
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

function fileRequirement(identifier: string): DependencyRequirement {
  return { provider: 'file', identifier, version: '*', alias: 'local' }
}

async function createProject(path: string): Promise<void> {
  await FileSystem.mkdir(Path.join(path, '.tao'), { recursive: true })
}
