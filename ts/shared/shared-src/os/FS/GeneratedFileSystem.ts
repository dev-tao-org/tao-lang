import * as Objects from '../../universal/Objects'
import { NullCharacter, Time } from '../../universal/universal'
import * as UserInput from '../../universal/UserInput'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import { createFsFromVolume, type IFs, Volume } from '../bridges/Bridge_memfs'
import * as Node from '../bridges/Bridge_node/Bridge_node'
import { Buffer as NodeBuffer } from '../bridges/Bridge_node/Bridge_node'
import { installGeneratedReaders } from './GeneratedFileReaders'

/** GeneratedSourceFiles maps generated paths to the source text stored in each file. */
export type GeneratedSourceFiles = Readonly<Record<string, string>>

/** installGeneratedFileSystem makes memory authoritative below one exclusively generated namespace.
 *  The immutable runtime link is the sole passthrough child. Install before Metro captures fs exports;
 *  callers must drain all source readers before replacing bytes. Open descriptors retain their owner. */
export function installGeneratedFileSystem(
  rootPath: string,
  initial: GeneratedSourceFiles,
): GeneratedFileSystem {
  const root = Node.resolve(rootPath)
  const runtime = Node.join(root, '_gen_runtime')
  const disk = Node.nativeFileSystem as unknown as FileOperations
  const original = Objects.copy(disk)
  const originalPromises = Objects.copy(Node.nativeFileSystemPromises) as unknown as FileOperations
  const runtimeTarget = original.realpathSync(runtime) as string
  let current = createSnapshot(root, runtimeTarget, initial)
  const normalize = (value: unknown) => normalizePath(value)
  const owns = (value: unknown) => {
    const path = normalize(value)
    return isGeneratedSourcePath(path, root, runtime)
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
  stage(files: GeneratedSourceFiles): GeneratedSnapshot
  replace(snapshot: GeneratedSnapshot): GeneratedSnapshot
  metadata(path: string): { type: 'f'; size: number; modifiedTime: number }
  dispose(): void
}

/** GeneratedSnapshot retains a complete immutable-by-contract memory filesystem. */
export type GeneratedSnapshot = IFs

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

type OptionalGeneratedPath = string | undefined
function isGeneratedSourcePath(path: OptionalGeneratedPath, root: string, runtime: string): boolean {
  if (path === undefined || !isInsideRoot(path, root)) {
    return false
  }
  return path !== runtime && !path.startsWith(runtime + Node.sep)
}

function isInsideRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(root + Node.sep)
}

function createSnapshot(root: string, runtime: string, files: GeneratedSourceFiles): GeneratedSnapshot {
  const candidate = createFsFromVolume(new Volume())
  candidate.mkdirSync(root, { recursive: true })
  const stamp = new Date(Time.now())
  for (const [path, text] of Object.entries(files)) {
    if (isInvalidPath(path)) {
      UserInput.Fail(`Unsupported generated source path: ${path}`)
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
  if (Node.isAbsolute(path) || path.includes('\\') || path.includes(NullCharacter)) {
    return true
  }
  return segments[0] === '_gen_runtime' || segments.some(segment => !segment || segment === '.' || segment === '..')
}

function normalizePath(value: unknown): string | undefined {
  const path = normalizePathInput(value)
  return typeof path === 'string' ? Node.resolve(path) : undefined
}

function normalizePathInput(value: unknown): unknown {
  if (isNativeURL(value)) {
    return Node.fileURLToPath(value)
  }
  if (NodeBuffer.isBuffer(value)) {
    return value.toString()
  }
  return value
}

function isNativeURL(value: unknown): value is WebHost.URL {
  return value instanceof WebHost.URL
}
