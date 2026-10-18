import { randomUUID } from 'node:crypto'
import { access as accessPath, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { Try } from '../universal/universal'

export { constants, existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs'
export { access, chmod, cp, mkdir, readdir, readFile, rename, rm, rmdir, symlink, writeFile } from 'node:fs/promises'

/** exists reports whether a filesystem path is accessible, including directories. */
export async function exists(path: string): Promise<boolean> {
  return await Try.WithDefault(false, async () => {
    await accessPath(path)
    return true
  })
}

/** writeIfChanged writes text only when the destination content differs. */
export async function writeIfChanged(path: string, content: string): Promise<boolean> {
  const current = await Try.WithDefault(undefined, () => readFile(path, 'utf8'))
  if (current === content) {
    return false
  }
  await writeFile(path, content)
  return true
}

/** replaceDirectoryLink atomically replaces a directory symlink without changing its target's contents. */
export async function replaceDirectoryLink(target: string, path: string): Promise<void> {
  const pending = `${path}.${randomUUID()}.pending`
  await Try(async () => {
    await symlink(target, pending, 'dir')
    await rename(pending, path)
  }, {
    finally: () => rm(pending, { force: true }),
  })
}

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

/** sourceFiles lists TypeScript sources while excluding installed dependencies.
 *  Load the compiler lazily so fresh setup can import OS APIs before dependencies are installed. */
export async function sourceFiles(root: string): Promise<string[]> {
  const { sys } = await import('typescript')
  return sys.readDirectory(root, ['.ts', '.tsx', '.mts', '.cts'], ['**/node_modules/**', '**/_gen_*/**'])
}
