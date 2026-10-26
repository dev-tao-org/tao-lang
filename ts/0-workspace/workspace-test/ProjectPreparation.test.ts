import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { readDependencyLock, resolveDependencyLockPath } from '../workspace-src/dependencies/LockFile'
import type { DependencyRequirement, DependencyStoreOptions } from '../workspace-src/dependencies/Types'
import { prepareProject } from '../workspace-src/ProjectPreparation'
import { initializeProject } from '../workspace-src/projects/Projects'

Tests.test('automatic preparation rejects reached aliases that resolve one repository to different commits', async () => {
  const root = Artifacts.resolvePath('tmp', `project-preparation-source-conflict-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  const requirements: DependencyRequirement[] = [
    { provider: 'github', identifier: 'example/shared', version: 'v1', alias: 'first' },
    { provider: 'github', identifier: 'example/shared', version: 'v2', alias: 'second' },
  ]
  const options: DependencyStoreOptions = {
    storeRoot: Path.join(root, 'source-cache'),
    readRequirements: async path => Path.resolve(path) === Path.resolve(root) ? requirements : [],
    git: {
      async resolveCommit(_repository, version) {
        return version === 'v1' ? 'a'.repeat(40) : 'b'.repeat(40)
      },
      async fetchCommit(_repository, _commit, destination) {
        await FileSystem.mkdir(Path.join(destination, '.tao'), { recursive: true })
        await FileSystem.mkdir(Path.join(destination, '@ui'), { recursive: true })
        await FileSystem.writeFile(
          Path.join(destination, '@ui', 'Widget.tao'),
          'public view Widget { render Text("ok") }\n',
        )
      },
    },
  }
  await Try(async () => {
    await initializeProject(root)
    await FileSystem.writeFile(
      entry,
      'requires github:example/shared version v1 as first\n'
        + 'requires github:example/shared version v2 as second\n'
        + 'use Widget from first@ui\nuse Widget from second@ui\napp Main { root Widget }\n',
    )
    await Tests.rejects(prepareProject(entry, { dependencyOptions: options }), /conflicting commits/)
    const lock = await readDependencyLock(resolveDependencyLockPath(root))
    Tests.expect(lock?.sources['github:example/shared']?.commit).toBe('a'.repeat(40))
    Tests.expect(lock?.roots).toEqual({ first: 'github:example/shared@v1' })
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
