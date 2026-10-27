import { createExpoCliLoader } from './Bridge_expo-cli/Bridge_expo-cli'

/** readVersion reads the file map selected by Expo's CLI. */
export function readVersion(directory: string): string {
  return (createExpoCliLoader(directory)('@expo/metro-file-map/package.json') as { version: string }).version
}

/** isLoaded reports whether the real file map was captured before the preload. */
export function isLoaded(directory: string): boolean {
  const loader = createExpoCliLoader(directory)
  return loader.cache[loader.resolve('@expo/metro-file-map')] !== undefined
}
