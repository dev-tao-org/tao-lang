import * as Path from './Path'
import * as Platform from './Platform'

/** resolveDirectory locates CLI development state shared across checkouts in the existing developer home. */
export function resolveDirectory(...segments: string[]): string {
  return Path.join(Platform.homeDirectory(), DevelopmentDirectoryName, ...segments)
}

const DevelopmentDirectoryName = '.tao-dev'
