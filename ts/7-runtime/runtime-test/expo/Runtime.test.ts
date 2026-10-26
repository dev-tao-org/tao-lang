import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import * as TypeScript from 'typescript'
import { readRuntimeSources } from '../../../CLIs/CLIs-src/cli-checks/runtime-sources'
import { writeExpoApplication } from '../../runtime-src/expo/Scaffold'
import { findPreparedToolchain, prepareToolchain } from '../../runtime-src/expo/Toolchain'
import * as Runtime from '../../runtime-src/Runtime'

Tests.test('Runtime.create prepares relocated compiled resources and reuses the pinned toolchain', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-create-${Platform.randomUUID()}`)
  await Try(() => verifyRuntimeCreate(root), {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('runtime source migration rejects linked parents before deleting files', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-linked-sources-${Platform.randomUUID()}`)
  await Try(() => verifyLinkedSourceParents(root), {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('runtime preparation installs a cold pinned cache and reuses it', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-preparation-${Platform.randomUUID()}`)
  await Try(async () => {
    const resources = Path.join(root, 'resources')
    const cache = Path.join(root, 'cache')
    await writeResources(resources, { expo: '57.0.30' }, 'prepare')
    Tests.expect(await Runtime.preparedRuntime({ resourcesDirectory: resources, toolchainCacheDirectory: cache }))
      .toBeUndefined()
    let installs = 0
    const options = {
      resourcesDirectory: resources,
      toolchainCacheDirectory: cache,
      install: {
        async install(directory: string) {
          installs++
          await FileSystem.mkdir(Path.join(directory, 'node_modules'), { recursive: true })
        },
      },
    }
    await Runtime.prepareRuntime(options)
    await Runtime.prepareRuntime(options)
    Tests.expect(installs).toBe(1)
    Tests.expect(await Runtime.preparedRuntime(options)).toBeDefined()
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('runtime toolchain cache identity includes runtime version and reuses matching inputs', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-toolchain-identity-${Platform.randomUUID()}`)
  await Try(async () => {
    const resources = Path.join(root, 'resources')
    const cache = Path.join(root, 'cache')
    await writeResources(resources, { expo: '57.0.30' }, 'identity')
    let installs = 0
    const installer = {
      async install(directory: string) {
        installs++
        await FileSystem.mkdir(Path.join(directory, 'node_modules'), { recursive: true })
      },
    }
    const inputs = { runtimeVersion: '1.4.2', os: 'darwin', architecture: 'arm64' }
    await prepareToolchain(cache, resources, installer, undefined, inputs)
    await prepareToolchain(cache, resources, installer, undefined, inputs)
    Tests.expect(installs).toBe(1)
    Tests.expect(await findPreparedToolchain(cache, resources, inputs)).toBeDefined()
    const changedInputs = { ...inputs, runtimeVersion: '1.5.0' }
    Tests.expect(await findPreparedToolchain(cache, resources, changedInputs)).toBeUndefined()
    await prepareToolchain(cache, resources, installer, undefined, changedInputs)
    Tests.expect(installs).toBe(2)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('runtime toolchain copies dependency patches and invalidates the cache when patch bytes change', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-toolchain-patches-${Platform.randomUUID()}`)
  await Try(async () => {
    const resources = Path.join(root, 'resources')
    const cache = Path.join(root, 'cache')
    const patchPath = 'patches/fixture.patch'
    await writeResources(resources, { expo: '57.0.30' }, 'patches')
    await FileSystem.writeFile(
      Path.join(resources, 'package.json'),
      JSON.stringify({
        dependencies: { expo: '57.0.30' },
        patchedDependencies: { 'expo@57.0.30': patchPath },
      }),
    )
    await FileSystem.mkdir(Path.dirname(Path.join(resources, patchPath)), { recursive: true })
    await FileSystem.writeFile(Path.join(resources, patchPath), 'patch bytes A')
    let installs = 0
    const installer = {
      async install(directory: string) {
        installs++
        await FileSystem.mkdir(Path.join(directory, 'node_modules'), { recursive: true })
      },
    }
    const inputs = { runtimeVersion: '1.4.2', os: 'darwin', architecture: 'arm64' }
    const first = await prepareToolchain(cache, resources, installer, undefined, inputs)
    Tests.expect(await FileSystem.readFile(Path.join(Path.dirname(first), patchPath), 'utf8')).toBe('patch bytes A')
    Tests.expect(installs).toBe(1)

    await FileSystem.writeFile(Path.join(resources, patchPath), 'patch bytes B')
    Tests.expect(await findPreparedToolchain(cache, resources, inputs)).toBeUndefined()
    const second = await prepareToolchain(cache, resources, installer, undefined, inputs)
    Tests.expect(await FileSystem.readFile(Path.join(Path.dirname(second), patchPath), 'utf8')).toBe('patch bytes B')
    Tests.expect(second).not.toBe(first)
    Tests.expect(installs).toBe(2)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function verifyLinkedSourceParents(root: string): Promise<void> {
  const directory = Path.join(root, 'generated')
  const sources = Path.join(directory, 'src/_gen_runtime')
  const separateDirectory = Path.join(root, 'separate-owned-fixture')
  await FileSystem.mkdir(sources, { recursive: true })
  await FileSystem.mkdir(separateDirectory, { recursive: true })
  const sentinel = Path.join(separateDirectory, 'TR.ts')
  const owned = Path.join(sources, 'owned.ts')
  await FileSystem.writeFile(sentinel, 'preserve linked contents')
  await FileSystem.writeFile(owned, 'preserve until migration accepted')
  await FileSystem.symlink(separateDirectory, Path.join(sources, 'runtime'), 'dir')
  await Tests.expect(writeExpoApplication(directory, root, {}, {}, ['owned.ts', 'runtime/TR.ts']))
    .rejects.toThrow()
  Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('preserve linked contents')
  Tests.expect(await FileSystem.readFile(owned, 'utf8')).toBe('preserve until migration accepted')
}

async function verifyRuntimeCreate(root: string): Promise<void> {
  const resourcesA = Path.join(root, 'relocated-resources-a')
  const resourcesB = Path.join(root, 'relocated-resources-b')
  const versionsA = { expo: '57.0.30', react: '19.2.3' }
  const versionsB = { expo: '58.0.0', react: '19.2.4' }
  await writeResources(resourcesA, versionsA, 'A')
  await writeResources(resourcesB, versionsB, 'B')
  await verifyMissingResourcesFailClearly(root)
  await verifyUnrelatedRuntimeFilesArePreserved(root, resourcesA)
  const created = await createApplications(root, resourcesA, resourcesB)
  await verifyCreatedApplications(root, created, versionsB, resourcesA, resourcesB)
}

async function verifyUnrelatedRuntimeFilesArePreserved(root: string, resourcesDirectory: string): Promise<void> {
  const directory = Path.join(root, 'runtime-with-user-file')
  const userFile = Path.join(directory, 'src/_gen_runtime/user-data.txt')
  await FileSystem.mkdir(Path.dirname(userFile), { recursive: true })
  await FileSystem.writeFile(userFile, 'preserve me')
  await Tests.expect(Runtime.create({
    directory,
    resourcesDirectory,
    toolchainCacheDirectory: Path.join(root, 'user-file-toolchains'),
    install: {
      async install(target) {
        await FileSystem.mkdir(Path.join(target, 'node_modules'), { recursive: true })
      },
    },
  })).rejects.toThrow('contains user files')
  Tests.expect(await FileSystem.readFile(userFile, 'utf8')).toBe('preserve me')
}

async function verifyMissingResourcesFailClearly(root: string): Promise<void> {
  const directory = Path.join(root, 'incomplete-resources')
  await writeResources(directory, { expo: '57.0.30' }, 'missing')
  await FileSystem.rm(Path.join(directory, 'runtime/HMRClient.ts'), { force: true })
  await Tests.expect(Runtime.create({
    directory: Path.join(root, 'incomplete'),
    resourcesDirectory: directory,
  })).rejects.toThrow('Compiled runtime resource is missing')
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
        await FileSystem.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  }
  await writeLegacyRuntimeDirectory(optionsA.directory, resourcesA)
  const first = await Runtime.create(optionsA)
  await FileSystem.writeFile(first.appPath, appSource)
  verifyAppTypechecks(first.directory, first.appPath)
  await Runtime.create(optionsA)
  const otherRuntime = await Runtime.create({ ...optionsA, directory: Path.join(root, 'second') })
  const changed = await Runtime.create({ ...optionsA, resourcesDirectory: resourcesB })
  return { first, otherRuntime, changed, installedDirectories }
}

async function verifyCreatedApplications(
  root: string,
  { first, otherRuntime, changed, installedDirectories }: CreatedApplications,
  dependencyVersions: Record<string, string>,
  resourcesA: string,
  resourcesB: string,
): Promise<void> {
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(first.directory, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  Tests.expect(first.directory).toBe(Path.join(root, 'first'))
  Tests.expect(await FileSystem.exists(Path.join(first.directory, '.tao'))).toBe(false)
  Tests.expect(installedDirectories.length).toBe(2)
  Tests.expect(manifest.dependencies).toEqual(dependencyVersions)
  Tests.expect(manifest.devDependencies).toEqual({})
  Tests.expect(FileSystem.lstatSync(Path.join(first.directory, 'src/_gen_runtime')).isSymbolicLink()).toBe(true)
  Tests.expect(FileSystem.realpathSync(Path.join(first.directory, 'src/_gen_runtime'))).toBe(
    FileSystem.realpathSync(resourcesB),
  )
  Tests.expect(FileSystem.realpathSync(Path.join(otherRuntime.directory, 'src/_gen_runtime')))
    .toBe(FileSystem.realpathSync(resourcesA))
  Tests.expect(FileSystem.realpathSync(Path.join(changed.directory, 'src/_gen_runtime')))
    .toBe(FileSystem.realpathSync(resourcesB))
  Tests.expect(await FileSystem.exists(Path.join(first.directory, 'src/_gen_runtime/runtime/Native.ts'))).toBe(false)
  Tests.expect(await FileSystem.exists(Path.join(first.directory, 'src/_gen_runtime/runtime/App.ts'))).toBe(true)
  Tests.expect(await FileSystem.readFile(first.appPath, 'utf8')).toBe(appSource)
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

async function writeLegacyRuntimeDirectory(directory: string, resourcesDirectory: string): Promise<void> {
  const target = Path.join(directory, 'src/_gen_runtime')
  await FileSystem.mkdir(target, { recursive: true })
  await FileSystem.writeFile(
    Path.join(target, 'TR.js'),
    await FileSystem.readFile(Path.join(resourcesDirectory, 'runtime/TR.ts'), 'utf8'),
  )
  await FileSystem.writeFile(Path.join(target, 'HMRClient.js'), 'legacy HMR bundle')
  const legacyNativeSource = Path.join(target, 'runtime/Native.ts')
  await FileSystem.mkdir(Path.dirname(legacyNativeSource), { recursive: true })
  await FileSystem.writeFile(legacyNativeSource, 'legacy Native runtime source')
}

async function writeResources(directory: string, dependencies: Record<string, string>, label: string): Promise<void> {
  await FileSystem.mkdir(directory, { recursive: true })
  const runtimeSources = await readRuntimeSources()
  await FileSystem.writeFile(
    Path.join(directory, 'runtime.json'),
    JSON.stringify({
      version: 2,
      identity: 'relocated-test',
      dependencies,
      sourceFiles: Object.keys(runtimeSources),
    }),
  )
  await FileSystem.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ dependencies }))
  await FileSystem.writeFile(Path.join(directory, 'bun.lock'), `fixture lock ${label}`)
  for (const [resource, sourcePath] of Object.entries(runtimeSources)) {
    const source = await FileSystem.readFile(Repo.resolvePath(sourcePath), 'utf8')
    const target = Path.join(directory, resource)
    await FileSystem.mkdir(Path.dirname(target), { recursive: true })
    await FileSystem.writeFile(target, source)
  }
}

function verifyAppTypechecks(directory: string, appPath: string): void {
  const configPath = Path.join(directory, 'tsconfig.json')
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
  const configDiagnostics = config.error ? [config.error] : []
  const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, directory)
  const program = TypeScript.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true })
  const diagnostics = [...configDiagnostics, ...parsed.errors, ...TypeScript.getPreEmitDiagnostics(program)].map(
    diagnostic => TypeScript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  )
  Tests.expect(diagnostics).toEqual([])
  Tests.expect(parsed.fileNames).toContain(appPath)
}

const appSource = S`
  import { AppDeclaration, ViewDeclaration, beginViewRender, finishViewRender } from '@runtime'
  import Tao from '@tao/runtime-api'
  import { createElement } from 'react'
  import type { ViewComponentProps } from '@runtime'

  function RootView(props: ViewComponentProps) {
    const context = beginViewRender(props)
    return finishViewRender(context, createElement(Tao.Text, null, 'Hello from Tao'))
  }
  const Root = ViewDeclaration('Root', [], RootView)

  export default function App() {
    return AppDeclaration(Root, 'runtime-check')
  }
`
