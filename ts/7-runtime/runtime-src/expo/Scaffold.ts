import { Json, UserInput } from '@shared'
import { Lists, S, Try } from '@shared'
import { FS, Path } from '@shared/os'
import { metroConfiguration } from '../bridges/Bridge_expo/Bridge_expo-config'
import type { RuntimePackageVersions } from '../Runtime'
import { writeGeneratedHost } from './GeneratedHost'
import * as RuntimeDependencyPolicy from './RuntimeDependencyPolicy'
import { serializeExpoTypeScriptConfig } from './TypeScriptConfig'

/** writeExpoApplication writes a minimal Expo app and readable Tao runtime sources. */
export async function writeExpoApplication(
  directory: string,
  resourcesDirectory: string,
  dependencies: RuntimePackageVersions,
  devDependencies: RuntimePackageVersions,
  sourceFiles: string[],
  options: ExpoScaffoldOptions = {},
): Promise<void> {
  await writeGeneratedHost(directory, {
    'package.json': serializeExpoPackageManifest(dependencies, devDependencies),
    'Application.ts': expoEntry,
    'metro.config.js': metroConfiguration,
    'tao-resolution.json': serializeTaoResolution(options),
    'app.json': serializeExpoAppManifest(),
    'tsconfig.json': serializeExpoTypeScriptConfig(),
  }, options.dependencyDirectory)
  await FS.mkdir(Path.join(directory, 'src'))
  await linkRuntimeSources(directory, resourcesDirectory, sourceFiles)
}

type ExpoScaffoldOptions = {
  watchFolders?: readonly string[]
  singletonPackages?: readonly string[]
  dependencyDirectory?: string
}
function serializeExpoPackageManifest(
  dependencies: RuntimePackageVersions,
  devDependencies: RuntimePackageVersions,
): string {
  return Json.Print({
    name: 'tao-preview',
    private: true,
    main: 'Application.ts',
    dependencies,
    devDependencies,
    scripts: { start: 'expo start', web: 'expo start --web --no-dev' },
  })
}

function serializeTaoResolution(options: ExpoScaffoldOptions): string {
  const singletonPackages = resolveSingletonPackages(options)
  return Json.Print({
    watchFolders: options.watchFolders ?? [],
    singletonPackages,
  })
}

function resolveSingletonPackages(options: ExpoScaffoldOptions): readonly string[] {
  return RuntimeDependencyPolicy.resolveRuntimeSingletonPackages(options.singletonPackages)
}

function serializeExpoAppManifest(): string {
  return Json.Print({ expo: { name: 'Tao Preview', slug: 'tao-preview', platforms: ['web'] } })
}

const expoEntry = S`
  import { registerRootComponent } from './src/_gen_runtime/runtime/Bridge_expo';
  import React from '@runtime/client/Bridge_react/Bridge_react';
  import ReactNative from '@runtime/client/Bridge_react-native';
  import { DefaultAppearance } from './src/_gen_runtime/runtime/Appearance';
  import App from './src/App';
  function TaoApplication() {
    return React.createElement(ReactNative.View, { style: { flex: 1, backgroundColor: DefaultAppearance.background } }, React.createElement(App));
  }
  registerRootComponent(TaoApplication);
`

async function linkRuntimeSources(directory: string, resourcesDirectory: string, sourceFiles: string[]): Promise<void> {
  const target = Path.join(directory, 'src/_gen_runtime')
  const current = await Try.WithDefault(undefined, () => FS.lstatSync(target))
  if (current?.isSymbolicLink()) {
    const existingPath = await Try.WithDefault(undefined, () => FS.realpathSync(target))
    if (existingPath === resourcesDirectory) {
      return
    }
    await FS.replaceDirectoryLink(resourcesDirectory, target)
    return
  }
  if (current?.isDirectory()) {
    await removeOwnedSourceCopies(target, sourceFiles)
    if (!await FS.isEmptyDir(target)) {
      UserInput.fail(`Generated runtime source path contains user files: ${target}`)
    }
    await FS.rmdir(target)
  } else if (current) {
    UserInput.fail(`Generated runtime source path is not a directory: ${target}`)
  } else {
    // A missing target needs no cleanup before creating the runtime source link.
  }
  await FS.symlink(resourcesDirectory, target, 'dir')
}

async function removeOwnedSourceCopies(target: string, sourceFiles: string[]): Promise<void> {
  const oldSources = [...sourceFiles, 'runtime/Native.ts', 'TR.js', 'HMRClient.js']
  const directories = Lists.unique(oldSources.flatMap(file => parentDirectories(target, file)))
    .sort((left, right) => left.length - right.length)
  await assertUnlinkedDirectories(directories)
  for (const file of oldSources) {
    await FS.rm(Path.join(target, file), { force: true })
  }
  for (const directory of directories.toReversed()) {
    const directoryIsEmpty = await Try.WithDefault(true, () => FS.isEmptyDir(directory))
    const current = await Try.WithDefault(undefined, () => FS.lstatSync(directory))
    if (current?.isDirectory() && directoryIsEmpty) {
      await FS.rmdir(directory)
    }
  }
}

async function assertUnlinkedDirectories(directories: readonly string[]): Promise<void> {
  for (const directory of directories) {
    const current = await Try.WithDefault(undefined, () => FS.lstatSync(directory))
    if (current?.isSymbolicLink()) {
      UserInput.fail(`Generated runtime source path contains a linked directory: ${directory}`)
    }
    if (current && !current.isDirectory()) {
      UserInput.fail(`Generated runtime source path is not a directory: ${directory}`)
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
