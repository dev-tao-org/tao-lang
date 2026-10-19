import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform, SessionLock } from '@shared/os'

/** NativeLockPointer identifies the immutable addon installation for one build identity. */
export type NativeLockPointer = { identity: string; directory: string }

/** readNativeLockPointer reads a validated current addon pointer. */
export async function readNativeLockPointer(root: string): Promise<NativeLockPointer | undefined> {
  const result = await readPointer(root)
  if (result.kind === 'invalid') {
    throwInvalidPointer(Path.join(root, 'current.json'))
  }
  return result.kind === 'valid' ? result.pointer : undefined
}

/** readNativeLockPointerForSetup ignores invalid generated state so setup can rebuild it. */
export async function readNativeLockPointerForSetup(root: string): Promise<NativeLockPointer | undefined> {
  const result = await readPointer(root)
  return result.kind === 'valid' ? result.pointer : undefined
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

type PointerRead = { kind: 'missing' | 'invalid' } | { kind: 'valid'; pointer: NativeLockPointer }

async function readPointer(root: string): Promise<PointerRead> {
  const path = Path.join(root, 'current.json')
  const contents = await Try(() => FileSystem.readFile(path, 'utf8'), {
    catch: error => isMissing(error) ? undefined : Errors.Throw(error),
  })
  if (contents === undefined) {
    return { kind: 'missing' }
  }
  const value = Try.WithDefault(undefined, () => JSON.parse(contents) as unknown)
  if (typeof value !== 'object' || value === null || !('identity' in value) || !('directory' in value)) {
    return { kind: 'invalid' }
  }
  const pointer = value as { identity: unknown; directory: unknown }
  if (typeof pointer.identity !== 'string' || typeof pointer.directory !== 'string') {
    return { kind: 'invalid' }
  }
  const normalized = { identity: pointer.identity, directory: pointer.directory }
  const versionRoot = Try.WithDefault(undefined, () => nativeLockVersionRoot(root, normalized))
  return versionRoot ? { kind: 'valid', pointer: normalized } : { kind: 'invalid' }
}

function throwInvalidPointer(path: string): never {
  Errors.ThrowHostEnvironment(`Native lock pointer is invalid or outdated. Run ./agent setup to rebuild it. (${path})`)
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
