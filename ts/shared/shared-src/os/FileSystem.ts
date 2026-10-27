import { Try } from '../universal/universal'
import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import * as BunHost from './bridges/Bridge_bun/Bridge_bun'
import * as Native from './bridges/Bridge_node/Bridge_node'

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
} from './bridges/Bridge_node/Bridge_node'
export { nativeFileSystem } from './bridges/Bridge_node/Bridge_node'
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
} from './bridges/Bridge_node/Bridge_node'
export { nativeFileSystemPromises } from './bridges/Bridge_node/Bridge_node'

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
export type File = BunHost.BunFile

/** file opens a lazy runtime file handle. */
export function file(path: string): File {
  return BunHost.getRuntime().file(path)
}

/** write writes text or bytes to a file or runtime file handle. */
export function write(path: string | WebHost.URL | File, data: string | Uint8Array): Promise<number> {
  return BunHost.getRuntime().write(path, data)
}

/** listSourceFiles lists TypeScript sources while excluding installed dependencies.
 *  Load the compiler lazily so fresh setup can import OS APIs before dependencies are installed. */
export async function listSourceFiles(root: string): Promise<string[]> {
  const { TypeScript } = await import('../bridges/Bridge_typescript')
  return TypeScript.sys.readDirectory(root, ['.ts', '.tsx', '.mts', '.cts'], ['**/node_modules/**', '**/_gen_*/**'])
}

/** listProductionSourceFiles excludes sibling test folders and test entries from shipped source inputs. */
export async function listProductionSourceFiles(root: string): Promise<string[]> {
  const paths = await listSourceFiles(root)
  return paths.filter(path => !isTestSourcePath(root, path))
}

function isTestSourcePath(root: string, path: string): boolean {
  const relative = Native.relative(root, path).replaceAll('\\', '/')
  return relative.split('/').some(segment => segment.endsWith('-test')) || /\.test\.[cm]?tsx?$/.test(relative)
}
