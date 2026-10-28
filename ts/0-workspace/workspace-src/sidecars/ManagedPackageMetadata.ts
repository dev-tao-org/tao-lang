import { Errors, Try } from '@shared'
import { FileSystem } from '@shared/os'

/** readStringEntries reads string-valued entries from unknown package metadata. */
export function readStringEntries(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/** readOptionalPeerNames reads peer dependencies whose metadata marks them optional. */
export function readOptionalPeerNames(value: unknown): Set<string> {
  if (!value || typeof value !== 'object') {
    return new Set()
  }
  return new Set(
    Object.entries(value).filter(([, metadata]) => isOptionalPeerMetadata(metadata)).map(([name]) => name),
  )
}

/** readPackageMetadata reads a package manifest or reports managed npm state failure. */
export async function readPackageMetadata(path: string): Promise<Record<string, unknown>> {
  return await Try(async () => JSON.parse(await FileSystem.readFile(path, 'utf8')) as Record<string, unknown>, {
    catch: () =>
      Errors.ThrowUserInput(`Managed npm state is missing or invalid at ${path}; repair with: tao setup --repair.`),
  })
}

function isOptionalPeerMetadata(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  return 'optional' in value && value.optional === true
}
