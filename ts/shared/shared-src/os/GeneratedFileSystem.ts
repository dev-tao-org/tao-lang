import { createFsFromVolume, Volume } from 'memfs'
import fs from 'node:fs'
import promises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Errors, Time } from '../universal/universal'
import { installGeneratedReaders } from './GeneratedFileReaders'

/** installGeneratedFileSystem makes memory authoritative below one exclusively generated namespace.
 *  The immutable runtime link is the sole passthrough child. Install before Metro captures fs exports;
 *  callers must drain all source readers before replacing bytes. Open descriptors retain their owner. */
export function installGeneratedFileSystem(
  rootPath: string,
  initial: Readonly<Record<string, string>>,
): GeneratedFileSystem {
  const root = resolve(rootPath)
  const runtime = join(root, '_gen_runtime')
  const disk = fs as unknown as FileOperations
  const original = { ...disk }
  const originalPromises = { ...promises } as unknown as FileOperations
  const runtimeTarget = original.realpathSync(runtime) as string
  let current = createSnapshot(root, runtimeTarget, initial)
  const normalize = (value: unknown) => normalizePath(value)
  const owns = (value: unknown) => {
    const path = normalize(value)
    return path !== undefined && (path === root || path.startsWith(root + sep))
      && path !== runtime && !path.startsWith(runtime + sep)
  }
  const restore = installGeneratedReaders({
    fs: disk,
    promises: promises as unknown as FileOperations,
    original,
    originalPromises,
    normalize,
    owns,
    current: () => current,
    root,
  })
  syncBuiltinESMExports()
  return {
    stage: files => createSnapshot(root, runtimeTarget, files),
    replace(snapshot) {
      const previous = current
      current = snapshot
      return previous
    },
    metadata(path) {
      const info = current.statSync(join(root, path))
      return { type: 'f', size: Number(info.size), modifiedTime: Number(info.mtimeMs) }
    },
    dispose() {
      restore()
      syncBuiltinESMExports()
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
    if (invalidPath(path)) {
      Errors.ThrowUserInput(`Unsupported generated source path: ${path}`)
    }
    const target = join(root, path)
    candidate.mkdirSync(dirname(target), { recursive: true })
    candidate.writeFileSync(target, text)
    candidate.utimesSync(target, stamp, stamp)
  }
  candidate.symlinkSync(runtime, join(root, '_gen_runtime'), 'dir')
  return candidate
}

function invalidPath(path: string): boolean {
  const segments = path.split('/')
  return isAbsolute(path) || path.includes('\\') || path.includes('\0') || segments[0] === '_gen_runtime'
    || segments.some(segment => !segment || segment === '.' || segment === '..')
}

function normalizePath(value: unknown): string | undefined {
  const path = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value
  return typeof path === 'string' ? resolve(path) : undefined
}
