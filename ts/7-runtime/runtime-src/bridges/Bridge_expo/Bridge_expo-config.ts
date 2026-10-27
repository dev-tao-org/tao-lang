import { S } from '@shared'
import { metroImports } from '../../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node-emission'
import { hmrResolution } from '../Bridge_expo-metro/Bridge_expo-metro'

/** metroConfiguration configures Expo's Metro graph using source-owned host imports. */
export const metroConfiguration = S`
  ${metroImports}
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
    ${hmrResolution}
    return context.resolveRequest(context, name, platform);
  };
  module.exports = config;
`
