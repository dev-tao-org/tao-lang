import { Errors, Try } from '@shared'
import { Files, FileSystem, Path, Platform } from '@shared/os'
import { isDiscoverableProjectDirectory } from '../modules/Paths'

/** ProjectLayout describes durable project metadata and generated state locations. */
export type ProjectLayout = {
  root: string
  taoDirectory: string
  cacheDirectory: string
  sessionsDirectory: string
  sessionLocksDirectory: string
}

/** initializeProject creates Tao's durable project metadata directory. */
export async function initializeProject(path: string): Promise<ProjectLayout> {
  const root = canonicalProjectTarget(path)
  if (isProjectDirectory(root)) {
    Errors.ThrowUserInput(`A Tao project is already initialized at ${root}`)
  }
  await rejectNestedProject(root)
  await FileSystem.mkdir(root, { recursive: true })
  const nested = await Files.findProjectMarker(root)
  if (nested) {
    Errors.ThrowUserInput(`Cannot initialize a Tao project containing another project at ${Path.dirname(nested)}`)
  }
  const tao = Path.join(root, '.tao')
  await FileSystem.mkdir(tao, { recursive: true })
  return await ensureProjectMetadata(root)
}

/** ensureProjectMetadata initializes durable identity and generated-state directories for a project. */
export async function ensureProjectMetadata(path: string): Promise<ProjectLayout> {
  const root = Path.resolve(path)
  if (!isProjectDirectory(root)) {
    Errors.ThrowUserInput(`No initialized Tao project exists at ${root}`)
  }
  const tao = Path.join(root, '.tao')
  await FileSystem.mkdir(Path.join(tao, 'cache'), { recursive: true })
  await FileSystem.mkdir(Path.join(tao, 'locks', 'sessions'), { recursive: true })
  await FileSystem.mkdir(Path.join(tao, 'store'), { recursive: true })
  await ensureProjectIdentity(Path.join(tao, 'store', 'project.json'))
  const ignore = Path.join(tao, '.gitignore')
  if (!await FileSystem.exists(ignore)) {
    await FileSystem.writeFile(ignore, 'cache/\nlocks/\n')
  }
  return projectLayout(root)
}

/** discoverProject resolves an initialized Tao project from a file or directory path. */
export async function discoverProject(
  path: string,
  homeDirectory = Platform.homeDirectory(),
): Promise<ProjectLayout | undefined> {
  let current = canonicalExistingPath(path)
  if (!isDirectory(current)) {
    current = Path.dirname(current)
  }
  while (true) {
    if (isDiscoverableProjectDirectory(current, homeDirectory)) {
      return projectLayout(current)
    }
    if (await FileSystem.exists(Path.join(current, '.git'))) {
      return undefined
    }
    const parent = Path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

/** projectLayout derives the stable metadata paths for a project. */
export function projectLayout(root: string): ProjectLayout {
  const taoDirectory = Path.join(root, '.tao')
  return {
    root,
    taoDirectory,
    cacheDirectory: Path.join(taoDirectory, 'cache'),
    sessionsDirectory: Path.join(taoDirectory, 'cache', 'sessions'),
    sessionLocksDirectory: Path.join(taoDirectory, 'locks', 'sessions'),
  }
}

function canonicalExistingPath(path: string): string {
  const absolute = Path.resolve(path)
  return Try.WithDefault(absolute, () => FileSystem.realpathSync(absolute))
}

async function rejectNestedProject(root: string): Promise<void> {
  let current = Path.dirname(root)
  while (current !== Path.dirname(current)) {
    if (isProjectAncestor(current)) {
      Errors.ThrowUserInput(`Cannot initialize a nested Tao project inside ${current}`)
    }
    current = Path.dirname(current)
  }
}

function canonicalProjectTarget(path: string): string {
  let current = Path.resolve(path)
  const missing: string[] = []
  while (!pathEntryExists(current)) {
    const parent = Path.dirname(current)
    if (parent === current) {
      break
    }
    missing.unshift(Path.basename(current))
    current = parent
  }
  const physical = Try.WithDefault(undefined, () => FileSystem.realpathSync(current))
    ?? Errors.ThrowUserInput(`Cannot resolve Tao project path: ${path}`)
  return missing.reduce((directory, name) => Path.join(directory, name), physical)
}

function isProjectAncestor(path: string): boolean {
  return isDiscoverableProjectDirectory(path)
}

function pathEntryExists(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path) !== undefined)
}

function isDirectory(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isDirectory())
}

function isProjectDirectory(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(Path.join(path, '.tao')).isDirectory())
}

async function ensureProjectIdentity(path: string): Promise<void> {
  if (!await FileSystem.exists(path)) {
    await FileSystem.writeFile(path, JSON.stringify({ version: 1, id: Platform.randomUUID() }, null, 2) + '\n')
  }
}
