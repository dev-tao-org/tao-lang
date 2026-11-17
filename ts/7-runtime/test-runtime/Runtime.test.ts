import * as RuntimeTooling from '@cli-kit/runtime-tooling'
import { Json } from '@shared'
import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import * as RuntimeDependencyPolicy from '../runtime-src/expo/RuntimeDependencyPolicy'
import { writeExpoApplication } from '../runtime-src/expo/Scaffold'
import * as Toolchain from '../runtime-src/expo/Toolchain'
import * as ToolchainIdentity from '../runtime-src/expo/ToolchainIdentity'
import * as Runtime from '../runtime-src/Runtime'

Tests.test('authored TypeScript mappings retain the stable runtime entry instead of a source-build identity', () => {
  const resources = Repo.resolvePath('ts/7-runtime/_gen_runtime')
  const paths = Runtime.runtimeTypeScriptPaths()
  Tests.expect(paths).toEqual({
    '@runtime/client/*': [Path.join(resources, 'runtime/*')],
    '@tao/runtime-api': [Path.join(resources, 'runtime/TaoRuntimeAPI.ts')],
    '@shared': [Path.join(resources, 'shared/shared.ts')],
  })
  Tests.expect(FS.existsSync(paths['@tao/runtime-api']![0]!)).toBe(true)
  Tests.expect(FS.existsSync(paths['@shared']![0]!)).toBe(true)
})

Tests.test('web preview scaffold excludes native platforms that trigger Expo Xcode probes', async () => {
  const directory = Artifacts.resolvePath('tmp', 'web-scaffold-' + Platform.randomUUID())
  Artifacts.trackTemporary(directory)
  await FS.mkdir(directory)
  await writeExpoApplication(directory, directory, {}, {}, [])
  const app = Json.Parse(await FS.readFile(Path.join(directory, 'app.json'), 'utf8')) as ExpoAppFixture
  const resolution = Json.Parse(await FS.readFile(Path.join(directory, 'tao-resolution.json'), 'utf8')) as {
    singletonPackages: string[]
  }
  Tests.expect(app.expo.platforms).toEqual(['web'])
  Tests.expect(resolution.singletonPackages).toEqual(['react', 'react-dom', 'react-native', 'react-native-web', 'expo'])
})

Tests.test('Runtime.create prepares relocated compiled resources and reuses the pinned toolchain', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-create-${Platform.randomUUID()}`)
  await Try(() => verifyRuntimeCreate(root), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('runtime source migration rejects linked parents before deleting files', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-linked-sources-${Platform.randomUUID()}`)
  await Try(() => verifyLinkedSourceParents(root), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
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
          await FS.mkdir(Path.join(directory, 'node_modules'))
        },
      },
    }
    await Runtime.prepareRuntime(options)
    await Runtime.prepareRuntime(options)
    Tests.expect(installs).toBe(1)
    Tests.expect(await Runtime.preparedRuntime(options)).toBeDefined()
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('runtime toolchain identity preserves cache bytes and distinguishes execution platforms', () => {
  const identity: ToolchainIdentity.ToolchainIdentity = {
    manifest: 'manifest',
    lockfile: 'lock',
    patches: { 'patches/x.patch': 'patch' },
    runtimeVersion: '1.4.2',
    os: 'darwin',
    architecture: 'arm64',
  }
  const expected = Platform.hashText(
    'manifest\u0000lock\u0000{"patches/x.patch":"patch"}\u00001.4.2\u0000darwin\u0000arm64\u0000bun-frozen-ignore-scripts-v1',
  )
  const key = ToolchainIdentity.calculateToolchainKey(identity)
  Tests.expect(key).toBe(expected)
  Tests.expect(ToolchainIdentity.calculateToolchainKey({ ...identity, runtimeVersion: '1.5.0' })).not.toBe(key)
  Tests.expect(ToolchainIdentity.calculateToolchainKey({ ...identity, os: 'linux' })).not.toBe(key)
  Tests.expect(ToolchainIdentity.calculateToolchainKey({ ...identity, architecture: 'x64' })).not.toBe(key)
})

Tests.test('runtime dependency policy pins Expo packages from exact lock identities', async () => {
  const directory = Artifacts.resolvePath('tmp', `runtime-policy-${Platform.randomUUID()}`)
  await Try(async () => {
    await FS.mkdir(directory)
    await FS.writeFile(Path.join(directory, 'package.json'), Json.Print({ patchedDependencies: {} }))
    await FS.writeFile(
      Path.join(directory, 'bun.lock'),
      Json.Print({
        packages: {
          '@expo/metro': ['@expo/metro@56.0.2'],
          '@expo/router-server': ['@expo/router-server@57.0.13'],
        },
      }),
    )

    const policy = await RuntimeDependencyPolicy.readRuntimeDependencyPolicy(directory)
    Tests.expect(policy.overrides).toEqual({ '@expo/metro': '56.0.2', '@expo/router-server': '57.0.13' })
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test('runtime toolchain copies dependency patches and invalidates the cache when patch bytes change', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-toolchain-patches-${Platform.randomUUID()}`)
  await Try(async () => {
    const resources = Path.join(root, 'resources')
    const cache = Path.join(root, 'cache')
    const patchPath = 'patches/fixture.patch'
    await writeResources(resources, { expo: '57.0.30' }, 'patches')
    await FS.writeFile(
      Path.join(resources, 'package.json'),
      Json.Print({
        dependencies: { expo: '57.0.30' },
        patchedDependencies: { 'expo@57.0.30': patchPath },
      }),
    )
    await FS.mkdir(Path.dirname(Path.join(resources, patchPath)))
    await FS.writeFile(Path.join(resources, patchPath), 'patch bytes A')
    let installs = 0
    const installer = {
      async install(directory: string) {
        installs++
        await FS.mkdir(Path.join(directory, 'node_modules'))
      },
    }
    const first = await Toolchain.prepareToolchain(cache, resources, installer)
    Tests.expect(await FS.readFile(Path.join(Path.dirname(first), patchPath), 'utf8')).toBe('patch bytes A')
    Tests.expect(installs).toBe(1)

    await FS.writeFile(Path.join(resources, patchPath), 'patch bytes B')
    Tests.expect(await Toolchain.findPreparedToolchain(cache, resources)).toBeUndefined()
    const second = await Toolchain.prepareToolchain(cache, resources, installer)
    Tests.expect(await FS.readFile(Path.join(Path.dirname(second), patchPath), 'utf8')).toBe('patch bytes B')
    Tests.expect(second).not.toBe(first)
    Tests.expect(installs).toBe(2)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

async function verifyLinkedSourceParents(root: string): Promise<void> {
  const directory = Path.join(root, 'generated')
  const sources = Path.join(directory, 'src/_gen_runtime')
  const separateDirectory = Path.join(root, 'separate-owned-fixture')
  await FS.mkdirs(sources, separateDirectory)
  const sentinel = Path.join(separateDirectory, 'TR.ts')
  const owned = Path.join(sources, 'owned.ts')
  await FS.writeFile(sentinel, 'preserve linked contents')
  await FS.writeFile(owned, 'preserve until migration accepted')
  await FS.symlink(separateDirectory, Path.join(sources, 'runtime'), 'dir')
  await Tests.expect(writeExpoApplication(directory, root, {}, {}, ['owned.ts', 'runtime/TR.ts']))
    .rejects.toThrow()
  Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('preserve linked contents')
  Tests.expect(await FS.readFile(owned, 'utf8')).toBe('preserve until migration accepted')
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
  await FS.mkdir(Path.dirname(userFile))
  await FS.writeFile(userFile, 'preserve me')
  await Tests.expect(Runtime.create({
    directory,
    resourcesDirectory,
    toolchainCacheDirectory: Path.join(root, 'user-file-toolchains'),
    install: {
      async install(target) {
        await FS.mkdir(Path.join(target, 'node_modules'))
      },
    },
  })).rejects.toThrow('contains user files')
  Tests.expect(await FS.readFile(userFile, 'utf8')).toBe('preserve me')
}

async function verifyMissingResourcesFailClearly(root: string): Promise<void> {
  const directory = Path.join(root, 'incomplete-resources')
  await writeResources(directory, { expo: '57.0.30' }, 'missing')
  await FS.rm(Path.join(directory, 'runtime/HMRClient.ts'), { force: true })
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
        await FS.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  }
  await writeLegacyRuntimeDirectory(optionsA.directory, resourcesA)
  const first = await Runtime.create(optionsA)
  await FS.writeFile(first.appPath, appSource)
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
  const manifest = Json.Parse(await FS.readFile(Path.join(first.directory, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  Tests.expect(first.directory).toBe(Path.join(root, 'first'))
  Tests.expect(await FS.exists(Path.join(first.directory, '.tao'))).toBe(false)
  Tests.expect(installedDirectories.length).toBe(2)
  Tests.expect(manifest.dependencies).toEqual(dependencyVersions)
  Tests.expect(manifest.devDependencies).toEqual({})
  Tests.expect(FS.lstatSync(Path.join(first.directory, 'src/_gen_runtime')).isSymbolicLink()).toBe(true)
  Tests.expect(FS.realpathSync(Path.join(first.directory, 'src/_gen_runtime'))).toBe(FS.realpathSync(resourcesB))
  Tests.expect(FS.realpathSync(Path.join(otherRuntime.directory, 'src/_gen_runtime')))
    .toBe(FS.realpathSync(resourcesA))
  Tests.expect(FS.realpathSync(Path.join(changed.directory, 'src/_gen_runtime')))
    .toBe(FS.realpathSync(resourcesB))
  Tests.expect(await FS.exists(Path.join(first.directory, 'src/_gen_runtime/runtime/Native.ts'))).toBe(false)
  Tests.expect(await FS.exists(Path.join(first.directory, 'src/_gen_runtime/runtime/App.ts'))).toBe(true)
  Tests.expect(await FS.readFile(first.appPath, 'utf8')).toBe(appSource)
  Tests.expect(otherRuntime.appPath).toBe(Path.join(root, 'second/src/App.tsx'))
  Tests.expect(FS.realpathSync(Path.join(changed.directory, 'node_modules'))).toBe(
    FS.realpathSync(Path.join(installedDirectories[1], 'node_modules')),
  )
  Tests.expect(FS.realpathSync(Path.join(otherRuntime.directory, 'node_modules'))).toBe(
    FS.realpathSync(Path.join(installedDirectories[0], 'node_modules')),
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
  await FS.mkdir(target)
  await FS.writeFile(
    Path.join(target, 'TR.js'),
    await FS.readFile(Path.join(resourcesDirectory, 'runtime/TR.ts'), 'utf8'),
  )
  await FS.writeFile(Path.join(target, 'HMRClient.js'), 'legacy HMR bundle')
  const legacyNativeSource = Path.join(target, 'runtime/Native.ts')
  await FS.mkdir(Path.dirname(legacyNativeSource))
  await FS.writeFile(legacyNativeSource, 'legacy Native runtime source')
}

async function writeResources(directory: string, dependencies: Record<string, string>, label: string): Promise<void> {
  await FS.mkdir(directory)
  const runtimeSources = await RuntimeTooling.readRuntimeSources()
  await FS.writeFile(
    Path.join(directory, 'runtime.json'),
    Json.Print({
      version: 2,
      identity: 'relocated-test',
      dependencies,
      sourceFiles: Object.keys(runtimeSources),
    }),
  )
  await FS.writeFile(Path.join(directory, 'package.json'), Json.Print({ dependencies }))
  await FS.writeFile(Path.join(directory, 'bun.lock'), `fixture lock ${label}`)
  for (const [resource, sourcePath] of Object.entries(runtimeSources)) {
    const source = await FS.readFile(Repo.resolvePath(sourcePath), 'utf8')
    const target = Path.join(directory, resource)
    await FS.mkdir(Path.dirname(target))
    await FS.writeFile(target, source)
  }
}

function verifyAppTypechecks(directory: string, appPath: string): void {
  const configPath = Path.join(directory, 'tsconfig.json')
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
  const configDiagnostics = config.error ? [config.error] : []
  const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, directory)
  const program = TypeScript.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true })
  const diagnostics = [...configDiagnostics, ...parsed.errors, ...TypeScript.getPreEmitDiagnostics(program)].map(
    diagnostic => TypeScript.flattenDiagnosticMessageText(diagnostic.messageText, NewlineCharacter),
  )
  Tests.expect(diagnostics).toEqual([])
  Tests.expect(parsed.fileNames).toContain(appPath)
}

const appSource = S`
  import { AppDeclaration, ViewDeclaration, beginViewRender, finishViewRender } from '@tao/runtime/generated'
  import Tao from '@tao/runtime-api'
  import React from '@runtime/client/Bridge_react/Bridge_react'
  import type { ViewComponentProps } from '@tao/runtime/generated'

  function RootView(props: ViewComponentProps) {
    const context = beginViewRender(props)
    return finishViewRender(context, React.createElement(Tao.Text, null, 'Hello from Tao'))
  }
  const Root = ViewDeclaration('Root', [], RootView)

  export default function App() {
    return AppDeclaration(Root, 'runtime-check')
  }
`

// Authored fixture output is inspected and deliberately damaged by these tests.
type ExpoAppFixture = { expo: Record<string, unknown> }
