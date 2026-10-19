import { chmod, lstat, mkdir, open, opendir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Errors, Try } from '../universal/universal'

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
  await mkdir(dirname(resolve(path)), { recursive: true })
  const canonicalParent = await realpath(dirname(resolve(path)))
  const canonical = join(canonicalParent, resolve(path).slice(dirname(resolve(path)).length + 1))
  await serialized(canonical, async () => {
    const existing = await Try(() => lstat(canonical), {
      catch(error) {
        if (!isMissing(error)) {
          Errors.Throw(error)
        }
        return undefined
      },
    })
    if (existing && !existing.isFile()) {
      Errors.ThrowUserInput(`Generated metadata must be a regular file: ${path}`)
    }
    if (!existing) {
      await createReadOnlyFile(canonical, contents)
    } else if (await readFile(canonical, 'utf8') !== contents) {
      await withOriginalPermissions(canonical, file => file.write(contents))
    }
    await chmod(canonical, 0o444)
  })
}

/** WritableFile writes content to the already opened file. */
export type WritableFile = { write(contents: string | Uint8Array): Promise<void> }

/** walk traverses regular files below a directory without following symlinks. */
export async function walk(root: string, options: { taoBoundary?: string | false } = {}): Promise<string[]> {
  const canonical = await realpath(root)
  return await walkDirectory(canonical, canonical, options.taoBoundary === false ? '' : options.taoBoundary ?? '.tao')
}

/** findProjectMarker finds the first nested .tao boundary without entering excluded trees or links. */
export async function findProjectMarker(root: string): Promise<string | undefined> {
  const canonical = await realpath(root)
  return await findMarker(canonical)
}

/** findProjects discovers project roots from empty .tao markers without entering project caches. */
export async function findProjects(root: string): Promise<string[]> {
  const canonical = await realpath(root)
  return [...await findProjectRoots(canonical)].sort()
}

/** skipDirectory identifies Tao's standard excluded directory names and optional workspace boundary. */
export function skipDirectory(name: string, taoBoundary: string | false = '.tao'): boolean {
  return excluded.has(name) || taoBoundary !== false && name === taoBoundary
}

const excluded = new Set(['node_modules', '.git', '.hg', '.svn', '.jj', 'Pods', '.gradle', '.venv', '.next', '.nuxt'])
const queues = new Map<string, Promise<void>>()

async function createReadOnlyFile(path: string, contents: string): Promise<void> {
  await Try(() => writeFile(path, contents, { flag: 'wx', mode: 0o444 }), {
    async catch(error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'EEXIST') {
        Errors.Throw(error)
      }
      const info = await lstat(path)
      if (!info.isFile()) {
        Errors.ThrowUserInput(`Generated metadata must be a regular file: ${path}`)
      }
      if (await readFile(path, 'utf8') !== contents) {
        Errors.ThrowUserInput(
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
  let mode: number | undefined
  return await Try(async () => {
    const original = await stat(canonical)
    mode = original.mode
    await chmod(canonical, original.mode | 0o200)
    return await operation({
      async write(contents) {
        const handle = await open(canonical, 'r+')
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
        await chmod(canonical, mode)
      }
    },
  })
}

async function walkDirectory(root: string, directory: string, boundary: string): Promise<string[]> {
  const result: string[] = []
  const entries = await opendir(directory)
  for await (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue
    }
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (skipDirectoryAtRoot(entry.name, path, root, boundary)) {
        continue
      }
      result.push(...await walkDirectory(root, path, boundary))
    } else if (entry.isFile()) {
      result.push(path)
    }
  }
  return result
}

async function findMarker(directory: string): Promise<string | undefined> {
  const entries = await opendir(directory)
  for await (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      continue
    }
    const path = join(directory, entry.name)
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
  const entries = await opendir(directory)
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
      children.push(join(directory, entry.name))
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
  const absolute = resolve(path)
  return await Try(async () => await realpath(absolute), {
    catch(error) {
      if (!isMissing(error)) {
        Errors.Throw(error)
      }
      return missingFilePath(absolute)
    },
  })
}

async function missingFilePath(absolute: string): Promise<string> {
  const parent = dirname(absolute)
  return join(await realpath(parent), absolute.slice(parent.length + 1))
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
