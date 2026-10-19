import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform, SessionLock } from '@shared/os'

/** NativeLockPointer identifies the immutable addon installation for one build identity. */
export type NativeLockPointer = { identity: string; directory: string }

/** readNativeLockPointer reads a validated current addon pointer, accepting the previous identity-only shape. */
export async function readNativeLockPointer(root: string): Promise<NativeLockPointer | undefined> {
  const path = Path.join(root, 'current.json')
  if (!await FileSystem.exists(path)) {
    return undefined
  }
  const value: unknown = JSON.parse(await FileSystem.readFile(path, 'utf8'))
  if (typeof value !== 'object' || value === null || !('identity' in value)) {
    Errors.ThrowHostEnvironment(`Native lock pointer is invalid: ${path}`)
  }
  const pointer = value as { identity: unknown; directory?: unknown }
  const directory = pointer.directory ?? pointer.identity
  if (typeof pointer.identity !== 'string' || typeof directory !== 'string') {
    Errors.ThrowHostEnvironment(`Native lock pointer is invalid: ${path}`)
  }
  const normalized = { identity: pointer.identity, directory }
  nativeLockVersionRoot(root, normalized)
  return normalized
}

/** nativeLockVersionRoot resolves only a direct, identity-matched addon version directory. */
export function nativeLockVersionRoot(root: string, pointer: NativeLockPointer): string {
  if (!SessionLock.isSafeVersionName(pointer.identity, pointer.directory)) {
    Errors.ThrowHostEnvironment(`Native lock version directory is invalid: ${pointer.directory}`)
  }
  const absoluteRoot = Path.resolve(root)
  const versionRoot = Path.resolve(absoluteRoot, pointer.directory)
  if (!Path.isWithin(absoluteRoot, versionRoot) || Path.dirname(versionRoot) !== absoluteRoot) {
    Errors.ThrowHostEnvironment(`Native lock version directory escapes its cache: ${pointer.directory}`)
  }
  return versionRoot
}

/** publishNativeLockVersion installs a built addon without changing any previously published version. */
export async function publishNativeLockVersion(root: string, staging: string, identity: string): Promise<void> {
  let directory = identity
  let versionRoot = nativeLockVersionRoot(root, { identity, directory })
  if (await FileSystem.exists(versionRoot)) {
    directory = `${identity}-${Platform.randomUUID()}`
    versionRoot = nativeLockVersionRoot(root, { identity, directory })
  }
  await FileSystem.writeFile(Path.join(staging, 'inputs.json'), identity)
  await FileSystem.rename(staging, versionRoot)
  await writeNativeLockPointer(root, { identity, directory })
}

/** writeNativeLockPointer atomically changes which immutable addon version future processes load. */
export async function writeNativeLockPointer(root: string, pointer: NativeLockPointer): Promise<void> {
  nativeLockVersionRoot(root, pointer)
  const path = Path.join(root, 'current.json')
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.writeFile(pending, JSON.stringify(pointer))
    await FileSystem.rename(pending, path)
  }, { finally: () => FileSystem.rm(pending, { force: true }) })
}
