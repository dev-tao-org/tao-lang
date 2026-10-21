import { Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { excludedName, excludedPath, realPathInsideProject, within } from './Paths'

/** directSourceFiles lists importable Tao files without descending into child directories. */
export async function directSourceFiles(directory: string, boundary: string): Promise<string[]> {
  if (!await safeDirectory(directory, boundary)) {
    return []
  }
  const files: string[] = []
  for (const entry of await directoryEntries(directory)) {
    const path = Path.join(directory, entry.name)
    if (
      isSourceEntry(entry.name, entry.isFile()) && await importableFile(path, boundary)
    ) {
      files.push(path)
    }
  }
  return files.sort()
}

/** recursiveSourceFiles walks one named package while respecting nested project roots. */
export async function recursiveSourceFiles(
  directory: string,
  packageRoot: string,
  projectRoot: string,
): Promise<string[]> {
  if (!await safeDirectory(directory, projectRoot) || !within(packageRoot, directory)) {
    return []
  }
  const files: string[] = []
  for (const entry of await directoryEntries(directory)) {
    if (excludedName(entry.name) || entry.name === 'node_modules') {
      continue
    }
    const path = Path.join(directory, entry.name)
    if (
      isSourceEntry(entry.name, entry.isFile()) && await importableFile(path, projectRoot)
    ) {
      files.push(path)
    } else if (await canDescendPackage(entry.name, entry.isDirectory(), path)) {
      files.push(...await recursiveSourceFiles(path, packageRoot, projectRoot))
    } else {
      // Other file types, nested packages and project boundaries are outside this package's sources.
    }
  }
  return files.sort()
}

/** namedPackageDirectories discovers local packages with an exact authored directory name. */
export async function namedPackageDirectories(projectRoot: string, name: string): Promise<string[]> {
  const found: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await directoryEntries(directory)) {
      if (!isSearchDirectory(entry.name, entry.isDirectory())) {
        continue
      }
      const path = Path.join(directory, entry.name)
      if (entry.name === name) {
        if (await safeDirectory(path, projectRoot)) {
          found.push(path)
        }
      } else if (!await FileSystem.exists(Path.join(path, '.tao'))) {
        await visit(path)
      } else {
        // Nested projects own their packages and are not searched from this project.
      }
    }
  }
  if (await safeDirectory(projectRoot, projectRoot)) {
    await visit(projectRoot)
  }
  return found.sort()
}

/** importableFile confirms an existing Tao file stays within its real project boundary. */
export async function importableFile(path: string, boundary: string): Promise<boolean> {
  return path.endsWith('.tao') && !excludedPath(path, boundary) && await FileSystem.exists(path)
    && Try.WithDefault(false, () => FileSystem.lstatSync(path).isFile())
    && realPathInsideProject(path, boundary) !== undefined
}

function isSourceEntry(name: string, isFile: boolean): boolean {
  return isFile && name.endsWith('.tao') && !excludedName(name)
}

async function canDescendPackage(name: string, isDirectory: boolean, path: string): Promise<boolean> {
  return isDirectory && !name.startsWith('@') && !await FileSystem.exists(Path.join(path, '.tao'))
}

function isSearchDirectory(name: string, isDirectory: boolean): boolean {
  return isDirectory && !excludedName(name) && name !== 'node_modules'
}

// safeDirectory confirms a directory stays within its real project boundary.
async function safeDirectory(path: string, boundary: string): Promise<boolean> {
  return !excludedPath(path, boundary) && await FileSystem.exists(path)
    && Try.WithDefault(false, () => FileSystem.lstatSync(path).isDirectory())
    && realPathInsideProject(path, boundary) !== undefined
}

async function directoryEntries(
  path: string,
): Promise<Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>> {
  const fallback: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }> = []
  return await Try.WithDefault(fallback, () => FileSystem.readdir(path, { withFileTypes: true }))
}
