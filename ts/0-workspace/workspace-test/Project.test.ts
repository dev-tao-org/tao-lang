import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { createProject } from '../workspace-src/Project'

Tests.test('persistent Expo projects reuse their matching runtime dependency link', async () => {
  const directory = Artifacts.resolvePath('tmp', `persistent-project-${Platform.randomUUID()}`)
  await Try(async () => {
    const project = await createProject({ directory, persistent: true })
    const repeated = await createProject({ directory, persistent: true })
    Tests.expect(repeated.appPath).toBe(project.appPath)
    Tests.expect(FileSystem.realpathSync(Path.join(project.expoDirectory, 'node_modules'))).toBe(
      FileSystem.realpathSync(Repo.resolvePath('ts/7-runtime/node_modules')),
    )
  }, {
    finally() {
      return FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
})
