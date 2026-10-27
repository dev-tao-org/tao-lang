import { Errors, S, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { metroConfiguration } from '../bridges/Bridge_expo/Bridge_expo-config'

/** writeExpoApplication writes a minimal Expo app and readable Tao runtime sources. */
export async function writeExpoApplication(
  directory: string,
  resourcesDirectory: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
  sourceFiles: string[],
  options: { watchFolders?: readonly string[]; singletonPackages?: readonly string[] } = {},
): Promise<void> {
  await FileSystem.writeIfChanged(
    Path.join(directory, 'package.json'),
    JSON.stringify(
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
    ),
  )
  await FileSystem.writeIfChanged(Path.join(directory, 'Application.ts'), expoEntry)
  await FileSystem.writeIfChanged(Path.join(directory, 'metro.config.js'), metroConfiguration)
  await FileSystem.writeIfChanged(
    Path.join(directory, 'tao-resolution.json'),
    JSON.stringify(
      {
        watchFolders: options.watchFolders ?? [],
        singletonPackages: options.singletonPackages
          ?? ['react', 'react-dom', 'react-native', 'react-native-web', 'expo'],
      },
      null,
      2,
    ),
  )
  await FileSystem.writeIfChanged(
    Path.join(directory, 'app.json'),
    JSON.stringify({ expo: { name: 'Tao Preview', slug: 'tao-preview' } }, null, 2),
  )
  await FileSystem.writeIfChanged(Path.join(directory, 'tsconfig.json'), JSON.stringify(expoTypeScriptConfig, null, 2))
  await FileSystem.mkdir(Path.join(directory, 'src'), { recursive: true })
  await linkRuntimeSources(directory, resourcesDirectory, sourceFiles)
}

const expoTypeScriptConfig = {
  extends: 'expo/tsconfig.base',
  compilerOptions: {
    baseUrl: '.',
    strict: true,
    jsxImportSource: '@runtime/client/Bridge_react',
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
    const remaining = await FileSystem.readdir(target)
    if (remaining.length > 0) {
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
  const directories = [...new Set(oldSources.flatMap(file => parentDirectories(target, file)))]
    .sort((left, right) => left.length - right.length)
  await assertUnlinkedDirectories(directories)
  for (const file of oldSources) {
    await FileSystem.rm(Path.join(target, file), { force: true })
  }
  for (const directory of directories.toReversed()) {
    const entries = await Try.WithDefault([], () => FileSystem.readdir(directory))
    const current = await Try.WithDefault(undefined, () => FileSystem.lstatSync(directory))
    if (current?.isDirectory() && entries.length === 0) {
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
