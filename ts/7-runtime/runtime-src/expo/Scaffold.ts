import { S } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** writeExpoApplication writes a minimal generated Expo app and its compiled Tao runtime entries. */
export async function writeExpoApplication(
  directory: string,
  resourcesDirectory: string,
  dependencies: Record<string, string>,
): Promise<void> {
  await FileSystem.writeIfChanged(
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
  await FileSystem.writeIfChanged(Path.join(directory, 'index.ts'), expoEntry)
  await FileSystem.writeIfChanged(Path.join(directory, 'metro.config.js'), metroConfiguration)
  await FileSystem.writeIfChanged(
    Path.join(directory, 'app.json'),
    JSON.stringify({ expo: { name: 'Tao Preview', slug: 'tao-preview' } }, null, 2),
  )
  await FileSystem.writeIfChanged(
    Path.join(directory, 'tsconfig.json'),
    JSON.stringify({ extends: 'expo/tsconfig.base' }, null, 2),
  )
  await FileSystem.mkdir(Path.join(directory, 'src'), { recursive: true })
  await writeRuntimeAssets(directory, resourcesDirectory)
}

const metroConfiguration = S`
  const path = require('node:path');
  const { getDefaultConfig } = require('expo/metro-config');
  const config = getDefaultConfig(__dirname);
  config.resolver.platforms = ['web', 'native'];
  config.resolver.resolveRequest = (context, name, platform) => {
    if (name === '@runtime') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/TR.js'), platform);
    if (name === '@expo/metro/metro-runtime/modules/HMRClient') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/HMRClient.js'), platform);
    if (name === 'tao:metro-hmr-client') return context.resolveRequest(context, '@expo/metro/metro-runtime/modules/HMRClient', platform);
    return context.resolveRequest(context, name, platform);
  };
  module.exports = config;
`

const expoEntry = S`
  import { registerRootComponent } from 'expo';
  import App from './src/App';
  registerRootComponent(App);
`

async function writeRuntimeAssets(directory: string, resourcesDirectory: string): Promise<void> {
  const target = Path.join(directory, 'src/_gen_runtime')
  await FileSystem.mkdir(target, { recursive: true })
  for (const file of ['TR.js', 'HMRClient.js']) {
    await FileSystem.writeIfChanged(
      Path.join(target, file),
      await FileSystem.readFile(Path.join(resourcesDirectory, file), 'utf8'),
    )
  }
}
