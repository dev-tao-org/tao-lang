import { Json } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { createConsumerHost } from '../../runtime-src/expo/ConsumerHost'
import { writeGeneratedHost } from '../../runtime-src/expo/GeneratedHost'
import { writeExpoApplication } from '../../runtime-src/expo/Scaffold'

Tests.test('generated Expo host refuses a linked root without writing into its unrelated target', async () => {
  const root = Artifacts.resolvePath('tmp', 'linked-host-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  const target = Path.join(root, 'unrelated')
  const host = Path.join(root, 'expo')
  await FileSystem.mkdir(target)
  await FileSystem.symlink(target, host, 'dir')
  await Tests.expect(writeGeneratedHost(host, { 'generated.txt': 'generated' })).rejects.toThrow('host root')
  Tests.expect(await FileSystem.readdir(target)).toEqual([])
  Tests.expect((await FileSystem.lstat(host)).isSymbolicLink()).toBe(true)
  await FileSystem.rm(host)
  await FileSystem.writeFile(host, 'preserve root file')
  await Tests.expect(writeGeneratedHost(host, {})).rejects.toThrow('host root')
  Tests.expect(await FileSystem.readFile(host, 'utf8')).toBe('preserve root file')
})

Tests.test('generated Expo host rejects array ownership records before removing unrelated numbered files', async () => {
  const host = Artifacts.resolvePath('tmp', 'malformed-host-' + Platform.randomUUID())
  Artifacts.trackTemporary(host)
  await FileSystem.mkdir(host)
  const sentinel = Path.join(host, '0')
  await FileSystem.writeFile(sentinel, 'sentinel')
  for (const ownership of [[], { files: ['sentinel'] }]) {
    const source = Json.Print(ownership)
    await FileSystem.writeFile(Path.join(host, 'tao-host.json'), source)
    await Tests.expect(writeGeneratedHost(host, {})).rejects.toThrow('Invalid generated Expo host')
    Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('sentinel')
    Tests.expect(await FileSystem.readFile(Path.join(host, 'tao-host.json'), 'utf8')).toBe(source)
  }
})

Tests.test('generated Expo host switches app and consumer packages while preserving unrelated data', async () => {
  const root = Artifacts.resolvePath('tmp', 'host-transitions-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  const host = Path.join(root, 'expo')
  await FileSystem.mkdir(host)
  const sentinel = Path.join(host, 'authored.txt')
  await FileSystem.writeFile(sentinel, 'preserve')
  const first = await createConsumerPackage(root, 'first')
  const second = await createConsumerPackage(root, 'second')
  const dependencyDirectory = Repo.resolvePath('ts/7-runtime/node_modules')
  await writeExpoApplication(host, root, {}, {}, [], { dependencyDirectory })
  await createConsumerHost(first)
  Tests.expect(await FileSystem.readFile(Path.join(host, 'metro.config.js'), 'utf8')).toContain('tao-consumer.json')
  Tests.expect(FileSystem.existsSync(Path.join(host, 'metro.config.cjs'))).toBe(false)
  await createConsumerHost(second)
  Tests.expect(FileSystem.realpathSync(Path.join(host, 'node_modules'))).toBe(Path.join(root, 'second/node_modules'))
  await writeExpoApplication(host, root, {}, {}, [], { dependencyDirectory })
  Tests.expect(FileSystem.realpathSync(Path.join(host, 'node_modules'))).toBe(
    FileSystem.realpathSync(dependencyDirectory),
  )
  Tests.expect(await FileSystem.readFile(Path.join(host, 'metro.config.js'), 'utf8')).toContain('tao-resolution.json')
  Tests.expect(FileSystem.existsSync(Path.join(host, 'tao-consumer.json'))).toBe(false)
  Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('preserve')
  Tests.expect(
    (Json.Parse(await FileSystem.readFile(Path.join(host, 'app.json'), 'utf8')) as ExpoHostFixture).expo.platforms,
  ).toEqual([
    'web',
  ])
  await verifyUnrelatedHostPaths(first, sentinel)
})

async function verifyUnrelatedHostPaths(
  options: Parameters<typeof createConsumerHost>[0],
  sentinel: string,
): Promise<void> {
  const config = Path.join(options.directory, 'metro.config.js')
  const generated = await FileSystem.readFile(config, 'utf8')
  await FileSystem.writeFile(config, 'preserve modified config')
  await Tests.expect(createConsumerHost(options)).rejects.toThrow('modified file')
  Tests.expect(await FileSystem.readFile(config, 'utf8')).toBe('preserve modified config')
  await FileSystem.rm(config)
  await FileSystem.symlink(sentinel, config)
  await Tests.expect(createConsumerHost(options)).rejects.toThrow('unrelated file')
  Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('preserve')
  await FileSystem.rm(config)
  await FileSystem.writeFile(config, generated)
  const modules = Path.join(options.directory, 'node_modules')
  await FileSystem.rm(modules)
  await FileSystem.symlink(Repo.resolvePath('ts/node_modules'), modules, 'dir')
  await Tests.expect(createConsumerHost(options)).rejects.toThrow('unrelated')
  Tests.expect(FileSystem.realpathSync(modules)).toBe(FileSystem.realpathSync(Repo.resolvePath('ts/node_modules')))
  Tests.expect(await FileSystem.readFile(config, 'utf8')).toBe(generated)
}

async function createConsumerPackage(root: string, name: string) {
  const packageDirectory = Path.join(root, name)
  await FileSystem.mkdir(Path.join(packageDirectory, 'node_modules'))
  await FileSystem.symlink(
    Repo.resolvePath('ts/7-runtime/node_modules/expo'),
    Path.join(packageDirectory, 'node_modules/expo'),
    'dir',
  )
  await FileSystem.writeFile(
    Path.join(packageDirectory, 'Consumer.tsx'),
    'export default function Consumer() { return null }',
  )
  return {
    directory: Path.join(root, 'expo'),
    packageDirectory,
    entry: 'Consumer.tsx',
    name,
    dependencies: {},
    devDependencies: {},
  }
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type ExpoHostFixture = { expo: { platforms: string[] } }
