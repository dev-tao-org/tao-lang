import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import * as Runtime from '../../runtime-src/Runtime'

Tests.test('Runtime.create prepares relocated compiled resources and reuses the pinned toolchain', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-create-${Platform.randomUUID()}`)
  await Try(() => verifyRuntimeCreate(root), {
    finally() {
      return FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

async function verifyRuntimeCreate(root: string): Promise<void> {
  const resourcesA = Path.join(root, 'relocated-resources-a')
  const resourcesB = Path.join(root, 'relocated-resources-b')
  const versionsA = { expo: '57.0.30', react: '19.2.3' }
  const versionsB = { expo: '58.0.0', react: '19.2.4' }
  await writeResources(resourcesA, versionsA, 'A')
  await writeResources(resourcesB, versionsB, 'B')
  const created = await createApplications(root, resourcesA, resourcesB)
  await verifyCreatedApplications(root, created, versionsB)
}

async function createApplications(root: string, resourcesA: string, resourcesB: string): Promise<CreatedApplications> {
  const installedDirectories: string[] = []
  const optionsA = {
    directory: Path.join(root, 'first'),
    resourcesDirectory: resourcesA,
    toolchainCacheDirectory: Path.join(root, 'toolchains'),
    install: {
      async install(directory: string) {
        installedDirectories.push(directory)
        await FileSystem.mkdir(Path.join(directory, 'node_modules'), { recursive: true })
      },
    },
  }
  const first = await Runtime.create(optionsA)
  await FileSystem.writeFile(first.appPath, 'compiled Tao application')
  await Runtime.create(optionsA)
  const otherRuntime = await Runtime.create({ ...optionsA, directory: Path.join(root, 'second') })
  const changed = await Runtime.create({ ...optionsA, resourcesDirectory: resourcesB })
  return { first, otherRuntime, changed, installedDirectories }
}

async function verifyCreatedApplications(
  root: string,
  { first, otherRuntime, changed, installedDirectories }: CreatedApplications,
  dependencyVersions: Record<string, string>,
): Promise<void> {
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(first.directory, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
  Tests.expect(first.directory).toBe(Path.join(root, 'first'))
  Tests.expect(await FileSystem.exists(Path.join(first.directory, '.tao'))).toBe(false)
  Tests.expect(installedDirectories.length).toBe(2)
  Tests.expect(manifest.dependencies).toEqual(dependencyVersions)
  Tests.expect(await FileSystem.readFile(Path.join(first.directory, 'src/_gen_runtime/TR.js'), 'utf8')).toBe(
    'compiled TR B',
  )
  Tests.expect(await FileSystem.readFile(first.appPath, 'utf8')).toBe('compiled Tao application')
  Tests.expect(otherRuntime.appPath).toBe(Path.join(root, 'second/src/App.tsx'))
  Tests.expect(FileSystem.realpathSync(Path.join(changed.directory, 'node_modules'))).toBe(
    FileSystem.realpathSync(Path.join(installedDirectories[1], 'node_modules')),
  )
  Tests.expect(FileSystem.realpathSync(Path.join(otherRuntime.directory, 'node_modules'))).toBe(
    FileSystem.realpathSync(Path.join(installedDirectories[0], 'node_modules')),
  )
}

type CreatedApplications = {
  first: Runtime.RuntimeApplication
  otherRuntime: Runtime.RuntimeApplication
  changed: Runtime.RuntimeApplication
  installedDirectories: string[]
}

async function writeResources(directory: string, dependencies: Record<string, string>, label: string): Promise<void> {
  await FileSystem.mkdir(directory, { recursive: true })
  await FileSystem.writeFile(
    Path.join(directory, 'runtime.json'),
    JSON.stringify({ version: 1, identity: 'relocated-test', dependencies }),
  )
  await FileSystem.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ dependencies }))
  await FileSystem.writeFile(Path.join(directory, 'bun.lock'), `fixture lock ${label}`)
  await FileSystem.writeFile(Path.join(directory, 'TR.js'), `compiled TR ${label}`)
  await FileSystem.writeFile(Path.join(directory, 'HMRClient.js'), `compiled HMR ${label}`)
}
