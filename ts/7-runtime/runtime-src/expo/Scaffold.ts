import { Errors, Lists, S, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { RuntimePackageVersions } from '../Runtime'

/** writeExpoApplication writes a minimal Expo app and readable Tao runtime sources. */
export async function writeExpoApplication(
  directory: string,
  resourcesDirectory: string,
  dependencies: RuntimePackageVersions,
  devDependencies: RuntimePackageVersions,
  sourceFiles: string[],
  options: ExpoScaffoldOptions = {},
): Promise<void> {
  await FileSystem.writeIfChanged(
    Path.join(directory, 'package.json'),
    serializeExpoPackageManifest(dependencies, devDependencies),
  )
  await FileSystem.writeIfChanged(Path.join(directory, 'Application.ts'), expoEntry)
  await FileSystem.writeIfChanged(Path.join(directory, 'metro.config.js'), metroConfiguration)
  await FileSystem.writeIfChanged(
    Path.join(directory, 'tao-resolution.json'),
    serializeTaoResolution(options),
  )
  await FileSystem.writeIfChanged(
    Path.join(directory, 'app.json'),
    serializeExpoAppManifest(),
  )
  await FileSystem.writeIfChanged(Path.join(directory, 'tsconfig.json'), serializeExpoTypeScriptConfig())
  await FileSystem.mkdir(Path.join(directory, 'src'))
  await linkRuntimeSources(directory, resourcesDirectory, sourceFiles)
}

type ExpoScaffoldOptions = { watchFolders?: readonly string[]; singletonPackages?: readonly string[] }
function serializeExpoPackageManifest(
  dependencies: RuntimePackageVersions,
  devDependencies: RuntimePackageVersions,
): string {
  return JSON.stringify(
    {
      name: 'tao-preview',
      private: true,
      main: 'Application.ts',
      dependencies,
      devDependencies,
      scripts: { web: 'expo start --web --no-dev' },
    },
    null,
    2,
  )
}

function serializeTaoResolution(options: ExpoScaffoldOptions): string {
  const singletonPackages = resolveSingletonPackages(options)
  return JSON.stringify(
    {
      watchFolders: options.watchFolders ?? [],
      singletonPackages,
    },
    null,
    2,
  )
}

function resolveSingletonPackages(options: ExpoScaffoldOptions): readonly string[] {
  if (options.singletonPackages !== undefined && options.singletonPackages !== null) {
    return options.singletonPackages
  }
  return ['react', 'react-dom', 'react-native', 'react-native-web', 'expo']
}

function serializeExpoAppManifest(): string {
  return JSON.stringify({ expo: { name: 'Tao Preview', slug: 'tao-preview', platforms: ['web'] } }, null, 2)
}

function serializeExpoTypeScriptConfig(): string {
  return JSON.stringify(expoTypeScriptConfig, null, 2)
}

const metroConfiguration = S`
  const path = require('node:path');
  const fs = require('node:fs');
  const { getDefaultConfig } = require('expo/metro-config');
  const config = getDefaultConfig(__dirname);
  const tao = require('./tao-resolution.json');
  if (process.env.TAO_METRO_PRELOAD) {
    config.server.enhanceMiddleware = require(process.env.TAO_METRO_PRELOAD).enhanceMiddleware;
    config.maxWorkers = 1;
    config.resolver.useWatchman = false;
  }
  config.resolver.platforms = ['web', 'native'];
  config.watchFolders = [fs.realpathSync(path.join(__dirname, 'src/_gen_runtime')), ...tao.watchFolders];
  config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')];
  config.resolver.resolveRequest = (context, name, platform) => {
    const singleton = tao.singletonPackages.find(id => name === id || name.startsWith(id + '/'));
    if (singleton) return context.resolveRequest(context, path.join(__dirname, 'node_modules', name), platform);
    if (name.startsWith('@runtime/client/')) return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/runtime', name.slice('@runtime/client/'.length)), platform);
    if (name === '@runtime') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/runtime/TR.ts'), platform);
    if (name === '@tao/runtime-api') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/runtime/TaoRuntimeAPI.ts'), platform);
    if (name === '@shared') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/shared/shared.ts'), platform);
    if (name === '@shared/os/preview') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/shared/os/preview/PreviewPlatform.ts'), platform);
    if (name === '@expo/metro/metro-runtime/modules/HMRClient') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/runtime/HMRClient.ts'), platform);
    if (name === 'tao:metro-hmr-client') return context.resolveRequest(context, '@expo/metro/metro-runtime/modules/HMRClient', platform);
    return context.resolveRequest(context, name, platform);
  };
  module.exports = config;
`

const expoTypeScriptConfig = {
  extends: 'expo/tsconfig.base',
  compilerOptions: {
    baseUrl: '.',
    strict: true,
    preserveSymlinks: true,
    paths: {
      '@runtime': ['src/_gen_runtime/runtime/TR.ts'],
      '@runtime/client/*': ['src/_gen_runtime/runtime/*'],
      '@tao/runtime-api': ['src/_gen_runtime/runtime/TaoRuntimeAPI.ts'],
      '@shared': ['src/_gen_runtime/shared/shared.ts'],
      '@shared/os/preview': ['src/_gen_runtime/shared/os/preview/PreviewPlatform.ts'],
    },
  },
}

const expoEntry = S`
  import { registerRootComponent } from 'expo';
  import React from '@runtime/client/Bridge-React';
  import ReactNative from '@runtime/client/Bridge-ReactNative';
  import { DefaultAppearance } from './src/_gen_runtime/runtime/Appearance';
  import App from './src/App';
  function TaoApplication() {
    return React.createElement(ReactNative.View, { style: { flex: 1, backgroundColor: DefaultAppearance.background } }, React.createElement(App));
  }
  registerRootComponent(TaoApplication);
`

async function linkRuntimeSources(directory: string, resourcesDirectory: string, sourceFiles: string[]): Promise<void> {
  const target = Path.join(directory, 'src/_gen_runtime')
  const current = await Try.WithDefault(undefined, () => FileSystem.lstatSync(target))
  if (current?.isSymbolicLink()) {
    const existingPath = await Try.WithDefault(undefined, () => FileSystem.realpathSync(target))
    if (existingPath === resourcesDirectory) {
      return
    }
    await FileSystem.replaceDirectoryLink(resourcesDirectory, target)
    return
  }
  if (current?.isDirectory()) {
    await removeOwnedSourceCopies(target, sourceFiles)
    if (!await FileSystem.isEmptyDir(target)) {
      Errors.ThrowUserInput(`Generated runtime source path contains user files: ${target}`)
    }
    await FileSystem.rmdir(target)
  } else if (current) {
    Errors.ThrowUserInput(`Generated runtime source path is not a directory: ${target}`)
  } else {
    // A missing target needs no cleanup before creating the runtime source link.
  }
  await FileSystem.symlink(resourcesDirectory, target, 'dir')
}

async function removeOwnedSourceCopies(target: string, sourceFiles: string[]): Promise<void> {
  const oldSources = [...sourceFiles, 'runtime/Native.ts', 'TR.js', 'HMRClient.js']
  const directories = Lists.unique(oldSources.flatMap(file => parentDirectories(target, file)))
    .sort((left, right) => left.length - right.length)
  await assertUnlinkedDirectories(directories)
  for (const file of oldSources) {
    await FileSystem.rm(Path.join(target, file), { force: true })
  }
  for (const directory of directories.toReversed()) {
    const directoryIsEmpty = await Try.WithDefault(true, () => FileSystem.isEmptyDir(directory))
    const current = await Try.WithDefault(undefined, () => FileSystem.lstatSync(directory))
    if (current?.isDirectory() && directoryIsEmpty) {
      await FileSystem.rmdir(directory)
    }
  }
}

async function assertUnlinkedDirectories(directories: readonly string[]): Promise<void> {
  for (const directory of directories) {
    const current = await Try.WithDefault(undefined, () => FileSystem.lstatSync(directory))
    if (current?.isSymbolicLink()) {
      Errors.ThrowUserInput(`Generated runtime source path contains a linked directory: ${directory}`)
    }
    if (current && !current.isDirectory()) {
      Errors.ThrowUserInput(`Generated runtime source path is not a directory: ${directory}`)
    }
  }
}

function parentDirectories(target: string, file: string): string[] {
  const result: string[] = []
  let directory = Path.dirname(Path.join(target, file))
  while (directory !== target && directory !== Path.dirname(directory)) {
    result.push(directory)
    directory = Path.dirname(directory)
  }
  return result
}
