import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import * as Stdlib from '@stdlib/Stdlib'
import { projectDependencyOptions } from '../workspace-src/dependencies/Options'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import type { DependencyRequirement, DependencyStoreOptions } from '../workspace-src/dependencies/Types'
import { ProjectDependencies } from '../workspace-src/ProjectDependencies'

Tests.test('the standard project is implicit, locked, and observed like other bundled projects', async () => {
  const root = Artifacts.resolvePath('tmp', `implicit-standard-project-${Platform.randomUUID()}`)
  await Try(async () => {
    await createProject(root)
    const options = await projectDependencyOptions(root)
    const requirements = await options.readRequirements(root)
    Tests.expect(requirements).toEqual([{ provider: 'bundled', identifier: 'tao', version: 'bundled' }])
    const lock = await prepareDependencies(root, requirements, options)
    const standardProject = await Stdlib.projectDirectory()
    Tests.expect(lock.sources['bundled:tao']?.location).toBe(standardProject)
    const dependencies = new ProjectDependencies(root, options)
    await dependencies.refresh()
    Tests.expect(await dependencies.resolveProject(Path.join(root, 'Main.tao'), 'tao'))
      .toEqual({ root: standardProject })
    Tests.expect(dependencies.sourceDirectories()).toContain(standardProject)
    await FileSystem.writeFile(Path.join(root, 'Dependencies.tao'), 'requires file:../unrelated as tao')
    await Tests.rejects(options.readRequirements(root), /alias tao belongs to the bundled Tao project/)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

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
