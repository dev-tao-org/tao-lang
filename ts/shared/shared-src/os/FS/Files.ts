import { Errors, Sort, Try } from '../../universal/universal'
import * as UserInput from '../../universal/UserInput'
import * as Native from '../bridges/Bridge_node/Bridge_node'
import * as FS from '../FS'

/** withWritableFile serializes writes per canonical path and restores the original permission mode. */
export async function withWritableFile<Value>(
  path: string,
  operation: (file: WritableFile) => Promise<Value>,
): Promise<Value> {
  const canonical = await canonicalFile(path)
  return await serialized(canonical, () => withOriginalPermissions(canonical, operation))
}

/** writeReadOnly replaces generated regular-file contents and protects the resulting metadata from edits. */
export async function writeReadOnly(path: string, contents: string): Promise<void> {
  const absolute = Native.resolve(path)
  const parent = Native.dirname(absolute)
  await FS.mkdir(parent)
  const canonicalParent = await Native.realpath(parent)
  const canonical = Native.join(canonicalParent, Native.basename(absolute))
  await serialized(canonical, async () => {
    const existing = await Try(() => Native.lstat(canonical), {
      catch(error) {
        if (!isMissing(error)) {
          Errors.Throw(error)
        }
        return undefined
      },
    })
    if (existing && !existing.isFile()) {
      UserInput.fail(`Generated metadata must be a regular file: ${path}`)
    }
    if (!existing) {
      await createReadOnlyFile(canonical, contents)
    } else if (await Native.readFile(canonical, 'utf8') !== contents) {
      await withOriginalPermissions(canonical, file => file.write(contents))
    } else {
      // Matching contents need no write; the permission check below still runs.
    }
    await Native.chmod(canonical, 0o444)
  })
}

/** WritableFile writes content to the already opened file. */
export type WritableFile = { write(contents: WritableContents): Promise<void> }

/** WalkOptions selects the Tao project-boundary behavior while traversing files. */
export type WalkOptions = { taoBoundary?: ProjectBoundary }

/** walk traverses regular files below a directory without following symlinks. */
export async function walk(root: string, options: WalkOptions = {}): Promise<string[]> {
  const canonical = await Native.realpath(root)
  return await walkDirectory(canonical, canonical, options.taoBoundary === false ? '' : options.taoBoundary ?? '.tao')
}

/** findProjectMarker finds the first nested .tao boundary without entering excluded trees or links. */
export async function findProjectMarker(root: string): Promise<string | undefined> {
  const canonical = await Native.realpath(root)
  return await findMarker(canonical)
}

/** findProjects discovers project roots from empty .tao markers without entering project caches. */
export async function findProjects(root: string): Promise<string[]> {
  const canonical = await Native.realpath(root)
  return [...await findProjectRoots(canonical)].sort(Sort.CompareStrings)
}

/** skipDirectory identifies Tao's standard excluded directory names and optional workspace boundary. */
export function skipDirectory(name: string, taoBoundary: WalkOptions['taoBoundary'] = '.tao'): boolean {
  return excluded.has(name) || taoBoundary !== false && name === taoBoundary
}

const excluded = new Set(['node_modules', '.git', '.hg', '.svn', '.jj', 'Pods', '.gradle', '.venv', '.next', '.nuxt'])
const queues = new Map<string, Promise<void>>()

type WritableContents = string | Uint8Array
type ProjectBoundary = string | false
type OriginalPermissionMode = number | undefined

async function createReadOnlyFile(path: string, contents: string): Promise<void> {
  await Try(() => Native.writeFile(path, contents, { flag: 'wx', mode: 0o444 }), {
    async catch(error) {
      if (!isExistingFileError(error)) {
        Errors.Throw(error)
      }
      const info = await Native.lstat(path)
      if (!info.isFile()) {
        UserInput.fail(`Generated metadata must be a regular file: ${path}`)
      }
      if (await Native.readFile(path, 'utf8') !== contents) {
        UserInput.fail(
          `Generated metadata was created concurrently with different contents: ${path}. Retry the command.`,
        )
      }
    },
  })
}

async function serialized<Value>(canonical: string, operation: () => Promise<Value>): Promise<Value> {
  const previous = queues.get(canonical) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => release = resolve)
  const tail = previous.then(() => current)
  queues.set(canonical, tail)
  await previous
  return await Try(operation, {
    finally() {
      release()
      if (queues.get(canonical) === tail) {
        queues.delete(canonical)
      }
    },
  })
}

async function withOriginalPermissions<Value>(
  canonical: string,
  operation: (file: WritableFile) => Promise<Value>,
): Promise<Value> {
  let mode: OriginalPermissionMode
  return await Try(async () => {
    const original = await Native.stat(canonical)
    mode = original.mode
    await Native.chmod(canonical, original.mode | 0o200)
    return await operation({
      async write(contents) {
        const handle = await Native.open(canonical, 'r+')
        await Try(async () => {
          await handle.truncate(0)
          await handle.writeFile(contents)
        }, {
          finally: () => handle.close(),
        })
      },
    })
  }, {
    async finally() {
      if (mode !== undefined) {
        await Native.chmod(canonical, mode)
      }
    },
  })
}

async function walkDirectory(root: string, directory: string, boundary: string): Promise<string[]> {
  const result: string[] = []
  const entries = await Native.opendir(directory)
  for await (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue
    }
    const path = Native.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (skipDirectoryAtRoot(entry.name, path, root, boundary)) {
        continue
      }
      result.push(...await walkDirectory(root, path, boundary))
    } else if (entry.isFile()) {
      result.push(path)
    } else {
      // Sockets, devices and other special entries are not source files.
    }
  }
  return result
}

async function findMarker(directory: string): Promise<string | undefined> {
  const entries = await Native.opendir(directory)
  for await (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      continue
    }
    const path = Native.join(directory, entry.name)
    if (entry.name === '.tao') {
      return path
    }
    if (!skipDirectory(entry.name)) {
      const marker = await findMarker(path)
      if (marker) {
        return marker
      }
    }
  }
  return undefined
}

async function findProjectRoots(directory: string): Promise<Set<string>> {
  const projects = new Set<string>()
  const children: string[] = []
  const entries = await Native.opendir(directory)
  let markerFound = false
  for await (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      continue
    }
    if (entry.name === '.tao') {
      projects.add(directory)
      markerFound = true
      break
    }
    if (!skipDirectory(entry.name)) {
      children.push(Native.join(directory, entry.name))
    }
  }
  if (markerFound) {
    return projects
  }
  for (const child of children) {
    for (const project of await findProjectRoots(child)) {
      projects.add(project)
    }
  }
  return projects
}

function skipDirectoryAtRoot(name: string, path: string, root: string, boundary: string): boolean {
  return skipDirectory(name, boundary) && path !== root
}

async function canonicalFile(path: string): Promise<string> {
  const absolute = Native.resolve(path)
  return await Try(async () => await Native.realpath(absolute), {
    catch(error) {
      if (!isMissing(error)) {
        Errors.Throw(error)
      }
      return missingFilePath(absolute)
    },
  })
}

async function missingFilePath(absolute: string): Promise<string> {
  const parent = Native.dirname(absolute)
  return Native.join(await Native.realpath(parent), absolute.slice(parent.length + 1))
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === 'ENOENT'
}

function isExistingFileError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === 'EEXIST'
}
