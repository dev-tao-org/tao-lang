import { Json, UserInput } from '@shared'
import { Try } from '@shared'
import { FS, Path } from '@shared/os'

type GeneratedHostFiles = Record<string, string>
type GeneratedHostOwnership = { files: GeneratedHostFiles; dependencies?: string }
const HostOwnershipFile = 'tao-host.json'

/** writeGeneratedHost replaces only files and dependency links recorded by the previous generated host. */
export async function writeGeneratedHost(
  directory: string,
  files: GeneratedHostFiles,
  dependencies?: string,
): Promise<void> {
  await requireHostDirectory(directory)
  const ownershipPath = Path.join(directory, HostOwnershipFile)
  const ownership = await readHostOwnership(ownershipPath)
  const previousFiles = ownership?.files ?? {}
  const names = new Set([...Object.keys(previousFiles), ...Object.keys(files)])
  for (const name of names) {
    await requireOwnedHostFile(directory, name, previousFiles[name])
  }
  await requireOwnedDependencyLink(directory, ownership?.dependencies)
  for (const name of names) {
    if (files[name] === undefined) {
      await FS.rm(Path.join(directory, name), { force: true })
    } else {
      await FS.writeIfChanged(Path.join(directory, name), files[name]!)
    }
  }
  const nextDependencies = dependencies === undefined ? ownership?.dependencies : Path.relative(directory, dependencies)
  if (nextDependencies) {
    await FS.replaceDirectoryLink(
      nextDependencies,
      Path.join(directory, 'node_modules'),
    )
  }
  await FS.writeIfChanged(ownershipPath, serializeHostOwnership(files, nextDependencies))
}

async function requireHostDirectory(directory: string): Promise<void> {
  const current = await Try.WithDefault(undefined, () => FS.lstat(directory))
  if (!current) {
    await FS.mkdir(directory)
    return
  }
  if (!current.isDirectory()) {
    UserInput.fail(
      `Generated Expo host root must be a real directory: ${directory}. Preserve the unrelated path before rebuilding.`,
    )
  }
}

async function requireOwnedHostFile(directory: string, name: string, expected?: string): Promise<void> {
  const path = Path.join(directory, name)
  const current = await Try.WithDefault(undefined, () => FS.lstat(path))
  if (!current) {
    return
  }
  if (!current.isFile() || expected === undefined) {
    UserInput.fail(
      `Generated Expo host contains unrelated file: ${path}. Preserve it, then run tao clean from the project root before rebuilding.`,
    )
  }
  if (await FS.readFile(path, 'utf8') !== expected) {
    UserInput.fail(
      `Generated Expo host contains modified file: ${path}. Preserve it, then run tao clean from the project root before rebuilding.`,
    )
  }
}

async function requireOwnedDependencyLink(directory: string, expected?: string): Promise<void> {
  const path = Path.join(directory, 'node_modules')
  const current = await Try.WithDefault(undefined, () => FS.lstat(path))
  if (!current) {
    return
  }
  const target = current.isSymbolicLink() ? Path.resolve(directory, await FS.readlink(path)) : undefined
  if (!expected || target !== Path.resolve(directory, expected)) {
    UserInput.fail(
      `Generated Expo host contains unrelated dependency path: ${path}. Preserve it, then run tao clean from the project root before rebuilding.`,
    )
  }
}

async function readHostOwnership(path: string): Promise<GeneratedHostOwnership | undefined> {
  const current = await Try.WithDefault(undefined, () => FS.lstat(path))
  if (!current) {
    return undefined
  }
  if (!current.isFile()) {
    return UserInput.fail(`Generated Expo host contains unrelated ownership path: ${path}.`)
  }
  const source = await FS.readFile(path, 'utf8')
  return parseHostOwnership(source)
}

function parseHostOwnership(source: string): GeneratedHostOwnership {
  const value: unknown = Json.Parse(source)
  if (!isOwnershipRecord(value)) {
    return UserInput.fail('Invalid generated Expo host ownership record.')
  }
  const files = value.files
  if (!isOwnershipRecord(files)) {
    return UserInput.fail('Invalid generated Expo host file record.')
  }
  for (const [name, content] of Object.entries(files)) {
    if (Path.basename(name) !== name || typeof content !== 'string') {
      return UserInput.fail('Invalid generated Expo host file record.')
    }
  }
  const dependencies = value.dependencies
  if (dependencies !== undefined && typeof dependencies !== 'string') {
    return UserInput.fail('Invalid generated Expo host dependency record.')
  }
  return { files: files as GeneratedHostFiles, dependencies }
}

function isOwnershipRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return !Array.isArray(value)
}

function serializeHostOwnership(files: GeneratedHostFiles, dependencies?: string): string {
  return Json.Print({ files, dependencies })
}
