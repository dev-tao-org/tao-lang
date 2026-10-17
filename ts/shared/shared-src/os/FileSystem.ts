import { writeFile } from 'node:fs/promises'
export { appendFileSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
export { access, chmod, mkdir, mkdtemp, readdir, rename as move, rm } from 'node:fs/promises'

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

/** writePrivate creates a new owner-only file without a window of public readability. */
export function writePrivate(path: string, data: string): Promise<void> {
  return writeFile(path, data, { mode: 0o600, flag: 'wx' })
}

/** sourceFiles lists TypeScript sources while excluding installed dependencies. */
export async function sourceFiles(root: string): Promise<string[]> {
  const { sys } = await import('typescript')
  return sys.readDirectory(root, ['.ts', '.tsx', '.mts', '.cts'], ['**/node_modules/**'])
}
