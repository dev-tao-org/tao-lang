import { Errors } from '@shared'
import * as ExpoFileMap from './Bridge_expo-metro-file-map'
import { createMetroLoader } from './Bridge_expo-metro/Bridge_expo-metro'

/** readVersion reads the underlying Metro dependency selected by Expo. */
export function readVersion(directory: string): string {
  return (createMetroLoader(directory)('metro/package.json') as { version: string }).version
}

/** assertMetroNotLoaded rejects filesystem readers captured before the authoritative preload. */
export function assertMetroNotLoaded(directory: string): void {
  if (isLoaded(directory) || ExpoFileMap.isLoaded(directory)) {
    Errors.ThrowHostEnvironment(
      'Metro was imported before its generated filesystem preload. Restart with Tao preloaded first.',
    )
  }
}

function isLoaded(directory: string): boolean {
  const loader = createMetroLoader(directory)
  return [loader.resolve('metro/private/Server'), loader.resolve('metro/private/HmrServer')].some(path =>
    loader.cache[path] !== undefined
  )
}
