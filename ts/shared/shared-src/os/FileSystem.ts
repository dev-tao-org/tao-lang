import {
  chmod as changeMode,
  lstat,
  mkdir as makeDirectory,
  mkdtemp as makeTemporaryDirectory,
  readFile,
  rename,
  rm as remove,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Errors, Time, Try } from '../universal/universal'

export { constants, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
export { access, chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'

/** File represents a runtime-backed file used for subprocess input. */
export type File = Bun.BunFile

/** file opens a lazy runtime file handle. */
export function file(path: string): File {
  return Bun.file(path)
}

/** write writes text or bytes to a file or runtime file handle. */
export function write(path: string | URL | File, data: string | Uint8Array): Promise<number> {
  return Bun.write(path, data)
}

/** sourceFiles lists TypeScript sources while excluding installed dependencies. */
export async function sourceFiles(root: string): Promise<string[]> {
  const { sys } = await import('typescript')
  return sys.readDirectory(root, ['.ts', '.tsx', '.mts', '.cts'], ['**/node_modules/**'])
}

/** updateLockedFile atomically changes a regular file, preserving its mode and rejecting concurrent replacement. */
export async function updateLockedFile(path: string, update: (source: string) => string): Promise<void> {
  const directory = dirname(path)
  const parent = await optionalMetadata(directory)
  if (!parent) {
    return
  }
  if (!parent.isDirectory() || parent.isSymbolicLink()) {
    Errors.ThrowUserInput(`Expected a real directory: ${directory}`)
  }
  const lock = path + '.tao-lock'
  await acquireFileLock(lock)
  await Try(() => replaceLockedFile(path, parent, update), {
    finally() {
      return remove(lock, { recursive: true })
    },
  })
}

async function acquireFileLock(path: string): Promise<void> {
  const deadline = Time.nowMs() + 30_000
  while (true) {
    const acquired = await Try(async () => {
      await makeDirectory(path, { mode: 0o700 })
      return true
    }, {
      catch(error) {
        if (!hasFileErrorCode(error, 'EEXIST')) {
          Errors.Throw(error)
        }
        return false
      },
    })
    if (acquired) {
      return
    }
    if (Time.nowMs() >= deadline) {
      Errors.ThrowHostEnvironment(`Timed out waiting for ${path}; check the other configuration writer.`)
    }
    await Time.sleep(100)
  }
}

async function replaceLockedFile(
  path: string,
  parent: NonNullable<Awaited<ReturnType<typeof optionalMetadata>>>,
  update: (source: string) => string,
): Promise<void> {
  const before = await optionalMetadata(path)
  if (before && (!before.isFile() || before.isSymbolicLink())) {
    Errors.ThrowUserInput(`Expected a regular configuration file: ${path}`)
  }
  const source = before ? await readFile(path, 'utf8') : ''
  const next = update(source)
  if (next === source) {
    return
  }
  const temporary = await makeTemporaryDirectory(join(dirname(path), '.tao-config-'))
  await Try(async () => {
    const staged = join(temporary, 'config')
    const mode = before ? before.mode & 0o777 : 0o600
    await writeFile(staged, next, { mode, flag: 'wx' })
    await changeMode(staged, mode)
    await assertFileUnchanged(path, parent, before, source)
    await rename(staged, path)
  }, {
    finally() {
      return remove(temporary, { recursive: true, force: true })
    },
  })
}

async function assertFileUnchanged(
  path: string,
  parent: Awaited<ReturnType<typeof optionalMetadata>>,
  before: Awaited<ReturnType<typeof optionalMetadata>>,
  source: string,
): Promise<void> {
  const currentParent = await optionalMetadata(dirname(path))
  const current = await optionalMetadata(path)
  const sameParent = currentParent?.isDirectory() && sameFileIdentity(parent, currentParent)
  const sameFile = JSON.stringify(current) === JSON.stringify(before)
  const sameContents = current === undefined || await readFile(path, 'utf8') === source
  if (!configurationUnchanged(sameParent === true, sameFile, sameContents)) {
    Errors.ThrowHostEnvironment(`Configuration changed while updating ${path}; retry the command.`)
  }
}

function configurationUnchanged(parent: boolean, file: boolean, contents: boolean): boolean {
  return parent && file && contents
}

function sameFileIdentity(
  left: Awaited<ReturnType<typeof optionalMetadata>>,
  right: Awaited<ReturnType<typeof optionalMetadata>>,
): boolean {
  return left?.dev === right?.dev && left?.ino === right?.ino && left?.uid === right?.uid
}

async function optionalMetadata(path: string) {
  return Try(() => lstat(path), {
    catch(error) {
      if (!hasFileErrorCode(error, 'ENOENT')) {
        Errors.Throw(error)
      }
      return undefined
    },
  })
}

function hasFileErrorCode(error: unknown, code: string): boolean {
  const original = Errors.isTaoError(error) ? error.cause : error
  return typeof original === 'object' && original !== null && 'code' in original && original.code === code
}
