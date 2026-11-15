import { Json } from '@shared'
import { Errors, Try } from '@shared'
import { FileLock, FS, Path, Platform } from '@shared/os'

/** NativeLockPointer identifies the immutable addon installation for one build identity. */
export type NativeLockPointer = { identity: string; directory: string }

/** readNativeLockPointerForSetup ignores invalid generated state so setup can rebuild it. */
export async function readNativeLockPointerForSetup(root: string): Promise<NativeLockPointer | undefined> {
  const result = await readPointer(root)
  return result.kind === 'valid' ? result.pointer : undefined
}

/** nativeLockVersionRoot resolves only a direct, identity-matched addon version directory. */
export function nativeLockVersionRoot(root: string, pointer: NativeLockPointer): string {
  if (!FileLock.isSafeVersionName(pointer.identity, pointer.directory)) {
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
  if (await FS.exists(versionRoot)) {
    directory = `${identity}-${Platform.randomUUID()}`
    versionRoot = nativeLockVersionRoot(root, { identity, directory })
  }
  await FS.writeFile(Path.join(staging, 'inputs.json'), identity)
  await FS.rename(staging, versionRoot)
  await writeNativeLockPointer(root, { identity, directory })
}

/** writeNativeLockPointer atomically changes which immutable addon version future processes load. */
export async function writeNativeLockPointer(root: string, pointer: NativeLockPointer): Promise<void> {
  nativeLockVersionRoot(root, pointer)
  const path = Path.join(root, 'current.json')
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FS.writeFile(pending, Json.Print(pointer))
    await FS.rename(pending, path)
  }, { finally: () => FS.rm(pending, { force: true }) })
}

type UnavailablePointerKind = 'missing' | 'invalid'
type PointerRead = { kind: UnavailablePointerKind } | { kind: 'valid'; pointer: NativeLockPointer }

async function readPointer(root: string): Promise<PointerRead> {
  const path = Path.join(root, 'current.json')
  const contents = await Try(() => FS.readFile(path, 'utf8'), {
    catch: error => isMissing(error) ? undefined : Errors.Throw(error),
  })
  if (contents === undefined) {
    return { kind: 'missing' }
  }
  const value = Try.WithDefault(undefined, () => Json.Parse(contents) as unknown)
  if (typeof value !== 'object' || value === null) {
    return { kind: 'invalid' }
  }
  if (!hasNativeLockPointerFields(value)) {
    return { kind: 'invalid' }
  }
  const pointer = value
  if (typeof pointer.identity !== 'string' || typeof pointer.directory !== 'string') {
    return { kind: 'invalid' }
  }
  const normalized = { identity: pointer.identity, directory: pointer.directory }
  const versionRoot = Try.WithDefault(undefined, () => nativeLockVersionRoot(root, normalized))
  return versionRoot ? { kind: 'valid', pointer: normalized } : { kind: 'invalid' }
}

function hasNativeLockPointerFields(value: object): value is { identity: unknown; directory: unknown } {
  return 'identity' in value && 'directory' in value
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === 'ENOENT'
}
