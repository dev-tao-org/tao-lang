import { writeFile } from 'node:fs/promises'
import { Try } from '../universal/universal'
import * as FileSystem from './FileSystem'
import * as Path from './Path'
import * as Repo from './Repo'

export { appendFileSync, mkdirSync } from 'node:fs'
export { rename as move } from 'node:fs/promises'
export { file, mkdir, mkdtemp, realpathSync, rm, write } from './FileSystem'

/** writePrivate creates a new owner-only artifact without a window of public readability. */
export function writePrivate(path: string, data: string): Promise<void> {
  return writeFile(path, data, { mode: 0o600, flag: 'wx' })
}

/** resolvePath resolves artifact paths beneath this checkout's shared artifact directory. */
export function resolvePath(...segments: string[]): string {
  return Path.resolve(Repo.resolvePath('.artifacts'), ...segments)
}

/** isWritable checks an artifact location or its nearest existing parent without creating files. */
export async function isWritable(...segments: string[]): Promise<boolean> {
  let existing = resolvePath(...segments)
  while (!FileSystem.existsSync(existing)) {
    existing = Path.dirname(existing)
  }
  return Try(async () => {
    await FileSystem.access(existing, FileSystem.constants.W_OK)
    return true
  }, {
    catch() {
      return false
    },
  })
}
