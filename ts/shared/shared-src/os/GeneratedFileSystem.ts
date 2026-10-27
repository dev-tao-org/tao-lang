import { createFsFromVolume, Volume } from 'memfs'
import { Errors, NullCharacter, Time } from '../universal/universal'
import { installGeneratedReaders } from './GeneratedFileReaders'
import * as Node from './NodeBuiltins'

/** installGeneratedFileSystem makes memory authoritative below one exclusively generated namespace.
 *  The immutable runtime link is the sole passthrough child. Install before Metro captures fs exports;
 *  callers must drain all source readers before replacing bytes. Open descriptors retain their owner. */
export function installGeneratedFileSystem(
  rootPath: string,
  initial: Readonly<Record<string, string>>,
): GeneratedFileSystem {
  const root = Node.resolve(rootPath)
  const runtime = Node.join(root, '_gen_runtime')
  const disk = Node.nativeFileSystem as unknown as FileOperations
  const original = { ...disk }
  const originalPromises = { ...Node.nativeFileSystemPromises } as unknown as FileOperations
  const runtimeTarget = original.realpathSync(runtime) as string
  let current = createSnapshot(root, runtimeTarget, initial)
  const normalize = (value: unknown) => normalizePath(value)
  const owns = (value: unknown) => {
    const path = normalize(value)
    return path !== undefined && (path === root || path.startsWith(root + Node.sep))
      && path !== runtime && !path.startsWith(runtime + Node.sep)
  }
  const restore = installGeneratedReaders({
    fs: disk,
    promises: Node.nativeFileSystemPromises as unknown as FileOperations,
    original,
    originalPromises,
    normalize,
    owns,
    current: () => current,
    root,
  })
  Node.syncBuiltinESMExports()
  return {
    stage: files => createSnapshot(root, runtimeTarget, files),
    replace(snapshot) {
      const previous = current
      current = snapshot
      return previous
    },
    metadata(path) {
      const info = current.statSync(Node.join(root, path))
      return { type: 'f', size: Number(info.size), modifiedTime: Number(info.mtimeMs) }
    },
    dispose() {
      restore()
      Node.syncBuiltinESMExports()
    },
  }
}

/** GeneratedFileSystem stages complete snapshots independently of their visible publication. */
export type GeneratedFileSystem = {
  stage(files: Readonly<Record<string, string>>): GeneratedSnapshot
  replace(snapshot: GeneratedSnapshot): GeneratedSnapshot
  metadata(path: string): { type: 'f'; size: number; modifiedTime: number }
  dispose(): void
}

/** GeneratedSnapshot retains a complete immutable-by-contract memory filesystem. */
export type GeneratedSnapshot = ReturnType<typeof createFsFromVolume>

/** FileOperations exposes the dynamic Node filesystem dispatch boundary. */
export type FileOperations = Record<string, (...args: unknown[]) => unknown>

/** GeneratedReaderOptions supplies captured original APIs and the current generated volume. */
export type GeneratedReaderOptions = {
  fs: FileOperations
  promises: FileOperations
  original: FileOperations
  originalPromises: FileOperations
  normalize(value: unknown): string | undefined
  owns(value: unknown): boolean
  current(): GeneratedSnapshot
  root: string
}

function createSnapshot(root: string, runtime: string, files: Readonly<Record<string, string>>): GeneratedSnapshot {
  const candidate = createFsFromVolume(new Volume())
  candidate.mkdirSync(root, { recursive: true })
  const stamp = new Date(Time.now())
  for (const [path, text] of Object.entries(files)) {
    if (isInvalidPath(path)) {
      Errors.ThrowUserInput(`Unsupported generated source path: ${path}`)
    }
    const target = Node.join(root, path)
    candidate.mkdirSync(Node.dirname(target), { recursive: true })
    candidate.writeFileSync(target, text)
    candidate.utimesSync(target, stamp, stamp)
  }
  candidate.symlinkSync(runtime, Node.join(root, '_gen_runtime'), 'dir')
  return candidate
}

function isInvalidPath(path: string): boolean {
  const segments = path.split('/')
  return Node.isAbsolute(path) || path.includes('\\') || path.includes(NullCharacter) || segments[0] === '_gen_runtime'
    || segments.some(segment => !segment || segment === '.' || segment === '..')
}

function normalizePath(value: unknown): string | undefined {
  const path = normalizePathInput(value)
  return typeof path === 'string' ? Node.resolve(path) : undefined
}

function normalizePathInput(value: unknown): unknown {
  if (value instanceof URL) {
    return Node.fileURLToPath(value)
  }
  if (Buffer.isBuffer(value)) {
    return value.toString()
  }
  return value
}
