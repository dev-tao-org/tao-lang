import { Artifacts, FileSystem, Path, Platform, Repo } from '@shared/os'
import { initializeProject } from '../workspace-src/projects/Projects'

/** createStandaloneLibraryFixture copies the ordinary local app and links existing pinned dependencies without installing. */
export async function createStandaloneLibraryFixture(): Promise<string> {
  const source = Repo.resolvePath('Apps/TS Lib App')
  const directory = Artifacts.resolvePath('standalone-library-' + Platform.randomUUID())
  Artifacts.trackTemporary(directory)
  await initializeProject(directory)
  await FileSystem.copyFile(Path.join(source, 'Justfile'), Path.join(directory, 'Justfile'))
  await FileSystem.cp(Path.join(source, 'src/tao'), Path.join(directory, 'src/tao'), { recursive: true })
  const packageDirectory = Path.join(directory, 'src/ts')
  await FileSystem.mkdir(packageDirectory)
  await FileSystem.writeFile(
    Path.join(packageDirectory, '.tao-test-source.json'),
    JSON.stringify({
      kind: 'tao-isolated-consumer-fixture',
      packageDirectory: FileSystem.realpathSync(packageDirectory),
    }),
  )
  for (const name of ['package.json', 'tsconfig.json', 'Consumer.tsx', 'test']) {
    await FileSystem.cp(Path.join(source, 'src/ts', name), Path.join(packageDirectory, name), { recursive: true })
  }
  const modules = Path.join(packageDirectory, 'node_modules')
  await FileSystem.mkdir(Path.join(modules, '@example'))
  await FileSystem.symlink(
    Path.join(directory, '.tao/cache/libraries/Demo'),
    Path.join(modules, '@example/tao-library'),
    'dir',
  )
  const sourceModules = Path.join(source, 'src/ts/node_modules')
  for (const item of await FileSystem.readdir(sourceModules, { withFileTypes: true })) {
    if (item.name !== '@example') {
      await FileSystem.symlink(Path.join(sourceModules, item.name), Path.join(modules, item.name), 'dir')
    }
  }
  return directory
}
