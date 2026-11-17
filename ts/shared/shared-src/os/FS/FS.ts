import z from '../../bridges/Bridge_zod'
import { Json, Regxs, Try } from '../../universal/universal'
import * as UserInput from '../../universal/UserInput'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'
import * as Native from '../bridges/Bridge_node/Bridge_node'

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
} from '../bridges/Bridge_node/Bridge_node'
export { nativeFileSystem } from '../bridges/Bridge_node/Bridge_node'
export {
  access,
  chmod,
  copyFile,
  cp,
  lstat,
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
} from '../bridges/Bridge_node/Bridge_node'
export { nativeFileSystemPromises } from '../bridges/Bridge_node/Bridge_node'

type JsonReadFileOptions = { encoding?: BufferEncoding; flag?: string; signal?: AbortSignal }
type JsonReadOptions<SchemaType extends z.ZodType> = Json.ParseOptions<SchemaType> & JsonReadFileOptions
type JsonSchemaReadOptions<SchemaType extends z.ZodType> = JsonReadOptions<SchemaType> & { schema: SchemaType }
type JsonUnknownReadOptions = Json.ParseOptions<never> & JsonReadFileOptions
type JsonWriteFileOptions = {
  encoding?: BufferEncoding
  flag?: string
  mode?: number
  signal?: AbortSignal
  flush?: boolean
}
type JsonWriteOptions = Json.PrintOptions & JsonWriteFileOptions
type OptionalJsonContents = string | undefined

/** mkdir creates a directory and any missing parents. */
export async function mkdir(path: string): Promise<string | undefined> {
  return await Native.mkdir(path, { recursive: true })
}

const PrivateDirectoryMode = 0o700
/** mkdirPrivate creates missing directories with owner-only access, preserving existing directory permissions. */
export async function mkdirPrivate(path: string): Promise<string | undefined> {
  return await Native.mkdir(path, { recursive: true, mode: PrivateDirectoryMode })
}

/** mkdirs creates each directory and its missing parents in argument order. */
export async function mkdirs(...paths: string[]): Promise<void> {
  for (const path of paths) {
    await mkdir(path)
  }
}

/** createExclusiveDirectory creates one directory and fails with EEXIST when its path already exists. */
export async function createExclusiveDirectory(path: string): Promise<void> {
  await Native.mkdir(path)
}

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

/** isEmptyDir reports whether a directory contains no entries and propagates filesystem failures. */
export async function isEmptyDir(path: string): Promise<boolean> {
  return (await Native.readdir(path)).length === 0
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

/** readJson reads UTF-8 JSON and optionally validates the decoded value. */
export async function readJson<SchemaType extends z.ZodType>(
  path: string,
  options: JsonSchemaReadOptions<SchemaType>,
): Promise<z.output<SchemaType>>
export async function readJson(path: string, options?: JsonUnknownReadOptions): Promise<unknown>
export async function readJson<SchemaType extends z.ZodType = z.ZodType>(
  path: string,
  options: JsonReadOptions<SchemaType> = {},
): Promise<unknown> {
  const encoding = options.encoding ?? 'utf8'
  const contents = await Native.readFile(path, { encoding, flag: options.flag, signal: options.signal })
  const sourceName = options.sourceName ?? path
  if (options.schema === undefined) {
    return Json.Parse(contents, { sourceName })
  }
  return await Json.ParseAsync(contents, { schema: options.schema, sourceName })
}

/** writeJson serializes JSON with the selected native file and print options. */
export async function writeJson(
  path: string,
  value: unknown,
  options: JsonWriteOptions = {},
): Promise<void> {
  const contents = Json.Print(value, options) as OptionalJsonContents
  if (contents === undefined) {
    UserInput.fail(`JSON value cannot be written to a file: ${path}`)
  }
  await Native.writeFile(path, contents, {
    encoding: options.encoding ?? 'utf8',
    flag: options.flag,
    mode: options.mode,
    signal: options.signal,
    flush: options.flush,
  })
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

type WritableTarget = string | WebHost.URL | File
type WritableData = string | Uint8Array
/** write writes text or bytes to a file or runtime file handle. */
export function write(path: WritableTarget, data: WritableData): Promise<number> {
  return BunHost.getRuntime().write(path, data)
}

const SourceDiscoveryExclusions = ['**/.*', '**/node_modules/**', '**/_gen_*/**']

/** listSourceFiles lists TypeScript sources, excluding hidden descendants, dependencies and generated directories.
 *  Load the compiler lazily so fresh setup can import OS APIs before dependencies are installed. */
export async function listSourceFiles(root: string): Promise<string[]> {
  const { TypeScript } = await import('../../bridges/Bridge_typescript')
  return TypeScript.sys.readDirectory(root, ['.ts', '.tsx', '.mts', '.cts'], SourceDiscoveryExclusions)
}

/** listProductionSourceFiles excludes sibling test folders and test entries from shipped source inputs. */
export async function listProductionSourceFiles(root: string): Promise<string[]> {
  const paths = await listSourceFiles(root)
  return paths.filter(path => !isTestSourcePath(root, path))
}

function isTestSourcePath(root: string, path: string): boolean {
  const relative = Native.relative(root, path).replaceAll('\\', '/')
  return relative.split('/').some(segment => segment.endsWith('-test')) || Regxs.TestSourceSuffix.test(relative)
}
