import { Try } from '../universal/universal'
import * as Native from './NodeBuiltins'

export {
  appendFileSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from './NodeBuiltins'
export { nativeFileSystem } from './NodeBuiltins'
export {
  access,
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  writeFile,
} from './NodeBuiltins'
export { nativeFileSystemPromises } from './NodeBuiltins'

/** resolveModule resolves a package entry using dependencies visible from a caller-owned directory. */
export function resolveModule(packageName: string, fromDirectory: string): string {
  return Native.createRequire(Native.resolve(fromDirectory, 'package.json')).resolve(packageName)
}

/** resolvePackageDirectory finds the installed package root visible from a caller-owned directory. */
export function resolvePackageDirectory(packageName: string, fromDirectory: string): string | undefined {
  let directory = Native.resolve(fromDirectory)
  while (true) {
    const packageDirectory = Native.resolve(directory, 'node_modules', packageName)
    if (Native.existsSync(Native.resolve(packageDirectory, 'package.json'))) {
      return packageDirectory
    }
    const parent = Native.dirname(directory)
    if (parent === directory) {
      return undefined
    }
    directory = parent
  }
}

/** exists reports whether a filesystem path is accessible, including directories. */
export async function exists(path: string): Promise<boolean> {
  return await Try.WithDefault(false, async () => {
    await Native.access(path)
    return true
  })
}

/** writeIfChanged writes text only when the destination content differs. */
export async function writeIfChanged(path: string, content: string): Promise<boolean> {
  const current = await Try.WithDefault(undefined, () => Native.readFile(path, 'utf8'))
  if (current === content) {
    return false
  }
  await Native.writeFile(path, content)
  return true
}

/** replaceDirectoryLink atomically replaces a directory symlink without changing its target's contents. */
export async function replaceDirectoryLink(target: string, path: string): Promise<void> {
  const pending = `${path}.${Native.randomUUID()}.pending`
  await Try(async () => {
    await Native.symlink(target, pending, 'dir')
    await Native.rename(pending, path)
  }, {
    finally: () => Native.rm(pending, { force: true }),
  })
}

/** File represents a runtime-backed file used for subprocess input. */
export type File = Bun.BunFile

/** file opens a lazy runtime file handle. */
export function file(path: string): File {
  return Bun.file(path)
}

type WritableTarget = string | URL | File
type WritableData = string | Uint8Array
/** write writes text or bytes to a file or runtime file handle. */
export function write(path: WritableTarget, data: WritableData): Promise<number> {
  return Bun.write(path, data)
}

/** listSourceFiles lists TypeScript sources while excluding installed dependencies.
 *  Load the compiler lazily so fresh setup can import OS APIs before dependencies are installed. */
export async function listSourceFiles(root: string): Promise<string[]> {
  const { sys } = await import('typescript')
  return sys.readDirectory(root, ['.ts', '.tsx', '.mts', '.cts'], ['**/node_modules/**', '**/_gen_*/**'])
}
