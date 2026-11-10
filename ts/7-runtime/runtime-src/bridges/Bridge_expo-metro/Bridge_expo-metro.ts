import { S } from '@shared'
import type { ModuleLoader } from '../../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node'
import { createRequire } from '../../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node'
import { createExpoCliLoader } from '../Bridge_expo-cli/Bridge_expo-cli'

/** MetroMethod describes one pinned source-consuming Metro operation. */
export type MetroMethod = (this: object, ...args: unknown[]) => unknown

/** MetroPrototype describes a private prototype selected through Expo's pinned wrapper. */
export type MetroPrototype = Record<string, MetroMethod>

/** createMetroLoader anchors resolution in Expo's wrapper package. */
export function createMetroLoader(directory: string): ModuleLoader {
  return createRequire(createExpoCliLoader(directory).resolve('@expo/metro/package.json'))
}

/** readVersion reads the exact Expo Metro wrapper version. */
export function readVersion(directory: string): string {
  return (createExpoCliLoader(directory)('@expo/metro/package.json') as { version: string }).version
}

type MetroPrototypeName = 'Server' | 'HmrServer' | 'DeltaBundler'
type MetroPrototypeModule = { prototype: MetroPrototype }

/** loadPrototype loads a supported private Metro prototype through Expo's wrapper. */
export function loadPrototype(
  name: MetroPrototypeName,
  directory: string,
): MetroPrototype {
  const loaded = createExpoCliLoader(directory)(prototypeSpecifiers[name]) as {
    default?: { prototype: MetroPrototype }
  }
  const module = loaded.default ?? loaded as unknown as MetroPrototypeModule
  return module.prototype
}

/** loadSocketFactory loads the pinned HMR websocket integration. */
export function loadSocketFactory<Value>(directory: string): Value {
  return createExpoCliLoader(directory)('@expo/metro/metro/lib/createWebsocketServer') as Value
}

/** hmrResolution emits the two internal aliases preserving Expo's actual HMR client. */
export const hmrResolution = S`
  if (name === '@expo/metro/metro-runtime/modules/HMRClient') return context.resolveRequest(context, path.join(__dirname, 'src/_gen_runtime/runtime/HMRClient.ts'), platform);
  if (name === 'tao:metro-hmr-client') return context.resolveRequest(context, '@expo/metro/metro-runtime/modules/HMRClient', platform);
`

const prototypeSpecifiers = {
  Server: '@expo/metro/metro/Server',
  HmrServer: '@expo/metro/metro/HmrServer',
  DeltaBundler: '@expo/metro/metro/DeltaBundler',
} as const
