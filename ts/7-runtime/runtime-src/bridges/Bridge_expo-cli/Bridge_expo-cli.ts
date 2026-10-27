import type { ModuleLoader } from '../../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node'
import * as Node from '../../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node'
import { createExpoLoader } from '../Bridge_expo/Bridge_expo-host'

/** createExpoCliLoader selects the CLI from the installed Expo package graph. */
export function createExpoCliLoader(directory: string): ModuleLoader {
  const expo = createExpoLoader(directory)
  return Node.createRequire(expo.resolve('@expo/cli/package.json'))
}

/** readVersion reads the actual loaded CLI's package version. */
export function readVersion(directory: string): string {
  return (createExpoCliLoader(directory)('@expo/cli/package.json') as { version: string }).version
}

/** readRequireSource reads the pinned React Refresh integration's source bytes. */
export function readRequireSource(directory: string): string {
  const root = Node.dirname(createExpoCliLoader(directory).resolve('@expo/cli/package.json'))
  return Node.readFileSync(Node.join(root, 'build/metro-require/require.js'), 'utf8')
}
