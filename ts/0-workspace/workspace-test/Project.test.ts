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
    await expectScaffoldDependenciesMatchRuntime(project.expoDirectory)
  }, {
    finally() {
      return FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
})

async function expectScaffoldDependenciesMatchRuntime(expoDirectory: string): Promise<void> {
  const runtime = JSON.parse(await FileSystem.readFile(Repo.resolvePath('ts/7-runtime/package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
  const scaffold = JSON.parse(await FileSystem.readFile(Path.join(expoDirectory, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
  const expected = Object.fromEntries(
    Object.entries(runtime.dependencies).filter((entry): entry is [string, string] =>
      !entry[1].startsWith('workspace:')
    ),
  )
  Tests.expect(scaffold.dependencies).toEqual(expected)
}
