import * as Path from '../Path'
/** resolveDirectory locates CLI development state shared across checkouts in the existing developer home. */
export function resolveDirectory(...segments: string[]): string {
  return Path.home.taoDev(...segments)
}
