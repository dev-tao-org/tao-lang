import { Errors, S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo } from '@shared/os'

/** createProject writes an isolated Expo web project that shares this checkout's installed dependencies. */
export async function createProject(options: ProjectOptions = {}): Promise<Project> {
  const directory = options.directory ?? Artifacts.resolvePath('performance', Platform.randomUUID())
  const expoDirectory = Path.join(directory, '.tao/cache')
  await FileSystem.mkdir(Path.join(directory, '.tao/store'), { recursive: true })
  await FileSystem.mkdir(Path.join(directory, '.tao/local'), { recursive: true })
  await FileSystem.mkdir(expoDirectory, { recursive: true })
  if (!options.persistent) {
    Artifacts.trackTemporary(directory)
  }
  await writeProjectFiles(expoDirectory)
  await linkRuntimeDependencies(Path.join(expoDirectory, 'node_modules'))
  const runtimeSource = Repo.resolvePath('ts/7-runtime/runtime-src')
  if (await FileSystem.exists(runtimeSource)) {
    const runtimeDirectory = Path.join(expoDirectory, '_runtime')
    await FileSystem.rm(runtimeDirectory, { recursive: true, force: true })
    await FileSystem.cp(runtimeSource, runtimeDirectory, { recursive: true })
    await copyRuntimeShared(runtimeDirectory)
  }
  return { directory, expoDirectory, appPath: Path.join(expoDirectory, '_gen_tao-app/App.tsx') }
}

/** Project describes the generated app files owned by a workspace session. */
export type Project = { directory: string; expoDirectory: string; appPath: string }

/** ProjectOptions selects an artifact directory for generated Expo source. */
export type ProjectOptions = { directory?: string; persistent?: boolean }

async function writeProjectFiles(directory: string): Promise<void> {
  await writePackage(directory, await runtimeDependencies())
  await writeEntry(directory)
  await writeMetroConfig(directory)
  await writeMetadata(directory)
  await FileSystem.mkdir(Path.join(directory, '_gen_tao-app'), { recursive: true })
}

async function writePackage(directory: string, dependencies: Record<string, string>): Promise<void> {
  await FileSystem.writeFile(
    Path.join(directory, 'package.json'),
    JSON.stringify(
      {
        name: 'tao-preview',
        private: true,
        main: 'index.ts',
        dependencies,
        scripts: { web: 'expo start --web --no-dev' },
      },
      null,
      2,
    ),
  )
}

async function runtimeDependencies(): Promise<Record<string, string>> {
  const manifestPath = Repo.resolvePath('ts/7-runtime/package.json')
  const manifest = JSON.parse(await FileSystem.readFile(manifestPath, 'utf8')) as RuntimeManifest
  const dependencies = manifest.dependencies
    ?? Errors.ThrowUnexpected(`Runtime package has no dependencies: ${manifestPath}`)
  return Object.fromEntries(
    Object.entries(dependencies).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && !entry[1].startsWith('workspace:')
    ),
  )
}

async function writeEntry(directory: string): Promise<void> {
  await FileSystem.writeFile(
    Path.join(directory, 'index.ts'),
    S`
      import { registerRootComponent } from 'expo';
      import App from './_gen_tao-app/App';
      registerRootComponent(App);
    `,
  )
}

type RuntimeManifest = { dependencies?: Record<string, string> }

async function writeMetroConfig(directory: string): Promise<void> {
  await FileSystem.writeFile(
    Path.join(directory, 'metro.config.js'),
    S`
      const path = require('node:path');
      const { getDefaultConfig } = require('expo/metro-config');
      const config = getDefaultConfig(__dirname);
      config.resolver.platforms = ['web', 'native'];
      config.resolver.resolveRequest = (context, name, platform) => {
        if (name === '@runtime') return context.resolveRequest(context, path.join(__dirname, '_runtime/TR.ts'), platform);
        if (name === '@shared') return context.resolveRequest(context, path.join(__dirname, '_runtime/Shared.ts'), platform);
        if (name === '@shared/os') return context.resolveRequest(context, path.join(__dirname, '_runtime/SharedOS.ts'), platform);
        if (name === '@expo/metro/metro-runtime/modules/HMRClient') return context.resolveRequest(context, path.join(__dirname, '_runtime/HMRClient.ts'), platform);
        if (name === 'tao:metro-hmr-client') return context.resolveRequest(context, '@expo/metro/metro-runtime/modules/HMRClient', platform);
        return context.resolveRequest(context, name, platform);
      };
      module.exports = config;
    `,
  )
}

async function writeMetadata(directory: string): Promise<void> {
  await FileSystem.writeFile(
    Path.join(directory, 'app.json'),
    JSON.stringify({ expo: { name: 'Tao Preview', slug: 'tao-preview' } }, null, 2),
  )
  await FileSystem.writeFile(
    Path.join(directory, 'tsconfig.json'),
    JSON.stringify({ extends: 'expo/tsconfig.base' }, null, 2),
  )
}

async function linkRuntimeDependencies(linkPath: string): Promise<void> {
  const dependencyPath = Repo.resolvePath('ts/7-runtime/node_modules')
  const existingPath = await Try(() => FileSystem.realpathSync(linkPath), {
    catch() {
      return undefined
    },
  })
  const expectedPath = FileSystem.realpathSync(dependencyPath)
  if (existingPath === expectedPath) {
    return
  }
  if (existingPath) {
    Errors.ThrowUserInput(`Generated Expo dependency link points elsewhere: ${linkPath}`)
  }
  await FileSystem.symlink(dependencyPath, linkPath, 'dir')
}

async function copyRuntimeShared(runtime: string): Promise<void> {
  const shared = Repo.resolvePath('ts/shared/shared-src')
  const universal = Path.join(runtime, '_shared/universal')
  const os = Path.join(runtime, '_shared/os')
  await FileSystem.mkdir(universal, { recursive: true })
  await FileSystem.mkdir(os, { recursive: true })
  await FileSystem.cp(Path.join(shared, 'universal/Errors.ts'), Path.join(universal, 'Errors.ts'))
  await FileSystem.cp(Path.join(shared, 'universal/Time.ts'), Path.join(universal, 'Time.ts'))
  await FileSystem.cp(Path.join(shared, 'os/PreviewPlatform.ts'), Path.join(os, 'PreviewPlatform.ts'))
  await FileSystem.writeFile(
    Path.join(runtime, 'Shared.ts'),
    S`
      export * as Errors from './_shared/universal/Errors';
      export * as Time from './_shared/universal/Time';
    `,
  )
  await FileSystem.writeFile(
    Path.join(runtime, 'SharedOS.ts'),
    S`
      export * as PreviewPlatform from './_shared/os/PreviewPlatform';
    `,
  )
}
