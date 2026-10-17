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
