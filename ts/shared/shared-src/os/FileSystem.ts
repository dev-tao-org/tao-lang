import { access as accessPath } from 'node:fs/promises'
import { Try } from '../universal/universal'

export { constants, existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs'
export { access, chmod, cp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'

/** exists reports whether a filesystem path is accessible, including directories. */
export async function exists(path: string): Promise<boolean> {
  return await Try(async () => {
    await accessPath(path)
    return true
  }, {
    catch() {
      return false
    },
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
