import * as Runtime from '@runtime'
import { Json } from '@shared'
import { Errors } from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import { initializeProject } from '../workspace-src/projects/Projects'

/** installRelocatedLibrary moves the artifact into the ordinary consumer and copies its separate Tao runtime. */
export async function installRelocatedLibrary(root: string, output: string, name: string): Promise<string> {
  const modules = Path.join(root, 'src/ts/node_modules')
  const library = Path.join(modules, name)
  const runtime = Path.join(modules, '@tao/runtime')
  await FS.rm(library, { force: true })
  await FS.rm(runtime, { force: true })
  await FS.rename(output, library)
  await FS.cp(Runtime.libraryRuntimePackageDirectory(), runtime, { recursive: true })
  await FS.rm(Path.join(root, 'src/tao'), { recursive: true })
  return library
}

/** createStandaloneLibraryFixture copies the ordinary local app and links existing pinned dependencies without installing. */
export async function createStandaloneLibraryFixture(): Promise<string> {
  const source = Repo.resolvePath('Apps/TS Lib App')
  const directory = Artifacts.resolvePath('standalone-library-' + Platform.randomUUID())
  Artifacts.trackTemporary(directory)
  await initializeProject(directory)
  await FS.copyFile(Path.join(source, 'Justfile'), Path.join(directory, 'Justfile'))
  await FS.cp(Path.join(source, 'src/tao'), Path.join(directory, 'src/tao'), { recursive: true })
  const packageDirectory = Path.join(directory, 'src/ts')
  await FS.mkdir(packageDirectory)
  await FS.writeFile(
    Path.join(packageDirectory, '.tao-test-source.json'),
    Json.Print({
      kind: 'tao-isolated-consumer-fixture',
      packageDirectory: FS.realpathSync(packageDirectory),
    }),
  )
  for (const name of LibraryConsumerSources) {
    await FS.cp(Path.join(source, 'src/ts', name), Path.join(packageDirectory, name), { recursive: true })
  }
  await linkStandaloneLibraryDependencies(directory)
  return directory
}

const LibraryConsumerSources = [
  'package.json',
  'tsconfig.json',
  'Consumer.tsx',
  'HeadlessCalculations.ts',
  'ForeignGreeting.tsx',
  'ReactiveCaptionProbe.tsx',
  'test',
]

/** linkStandaloneLibraryDependencies links this checkout's installed pinned runtime and browser dependencies. */
export async function linkStandaloneLibraryDependencies(directory: string): Promise<void> {
  const modules = Path.join(directory, 'src/ts/node_modules')
  await FS.mkdir(Path.join(modules, '@tao-dev'))
  await FS.symlink(
    Path.join(directory, '.tao/cache/sessions/.cli/libraries/Demo'),
    Path.join(modules, '@tao-dev/ts-lib-example'),
    'dir',
  )
  await FS.mkdir(Path.join(modules, '@tao'))
  await FS.symlink(Path.join(directory, '.tao/cache/runtime-package'), Path.join(modules, '@tao/runtime'), 'dir')
  const runtime = Repo.resolvePath('ts/7-runtime')
  const runtimePackages = [
    '@expo/metro-runtime',
    '@preact/signals-core',
    '@types/bun',
    '@types/react',
    'expo',
    'react',
    'react-dom',
    'react-native',
    'react-native-web',
    'typescript',
    'zod',
  ]
  for (const name of runtimePackages) {
    await linkInstalledPackage(name, runtime, modules)
  }
  const playwright = await linkInstalledPackage('playwright', Repo.resolvePath('ts/shared'), modules)
  await linkInstalledPackage('playwright-core', playwright, modules)
  // preserveSymlinks keeps declaration imports at the consumer, so expose their transitive type packages too.
  const bun = FS.realpathSync(Path.join(runtime, 'node_modules/@types/bun'))
  const bunTypes = await linkInstalledPackage('bun-types', bun, modules)
  const node = await linkInstalledPackage('@types/node', bunTypes, modules)
  await linkInstalledPackage('undici-types', node, modules)
  await FS.symlink(Path.join(runtime, 'node_modules/.bin'), Path.join(modules, '.bin'), 'dir')
}

async function linkInstalledPackage(name: string, owner: string, modules: string): Promise<string> {
  const installed = FS.resolvePackageDirectory(name, owner)
  if (!installed) {
    Errors.ThrowHostEnvironment(`Missing pinned test dependency ${name}; run ./agent unsandboxed setup.`)
  }
  const source = FS.realpathSync(installed)
  const destination = Path.join(modules, name)
  await FS.mkdir(Path.dirname(destination))
  await FS.symlink(source, destination, 'dir')
  return source
}
