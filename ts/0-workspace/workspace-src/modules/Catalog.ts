import { Sort, Try } from '@shared'
import { FS, Path } from '@shared/os'
import { isExcludedName, isExcludedPath, resolveRealPathInsideProject, within } from './Paths'

/** listDirectSourceFiles returns importable Tao files without descending into child directories. */
export async function listDirectSourceFiles(directory: string, boundary: string): Promise<string[]> {
  if (!await isSafeDirectory(directory, boundary)) {
    return []
  }
  const files: string[] = []
  for (const entry of await readDirectoryEntries(directory)) {
    const path = Path.join(directory, entry.name)
    if (
      isSourceEntry(entry.name, entry.isFile()) && await isImportableFile(path, boundary)
    ) {
      files.push(path)
    }
  }
  return files.sort(Sort.CompareStrings)
}

/** listRecursiveSourceFiles walks one named package while respecting nested project roots. */
export async function listRecursiveSourceFiles(
  directory: string,
  packageRoot: string,
  projectRoot: string,
): Promise<string[]> {
  if (!await isSafeDirectory(directory, projectRoot) || !within(packageRoot, directory)) {
    return []
  }
  const files: string[] = []
  for (const entry of await readDirectoryEntries(directory)) {
    if (isExcludedName(entry.name) || entry.name === 'node_modules') {
      continue
    }
    const path = Path.join(directory, entry.name)
    if (
      isSourceEntry(entry.name, entry.isFile()) && await isImportableFile(path, projectRoot)
    ) {
      files.push(path)
    } else if (await canDescendPackage(entry.name, entry.isDirectory(), path)) {
      files.push(...await listRecursiveSourceFiles(path, packageRoot, projectRoot))
    } else {
      // Other file types, nested packages and project boundaries are outside this package's sources.
    }
  }
  return files.sort(Sort.CompareStrings)
}

/** findNamedPackageDirectories discovers local packages with an exact authored directory name. */
export async function findNamedPackageDirectories(projectRoot: string, name: string): Promise<string[]> {
  const found: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readDirectoryEntries(directory)) {
      if (!isSearchDirectory(entry.name, entry.isDirectory())) {
        continue
      }
      const path = Path.join(directory, entry.name)
      if (entry.name === name) {
        if (await isSafeDirectory(path, projectRoot)) {
          found.push(path)
          await visit(path)
        }
      } else if (!await FS.exists(Path.join(path, '.tao'))) {
        await visit(path)
      } else {
        // Nested projects own their packages and are not searched from this project.
      }
    }
  }
  if (await isSafeDirectory(projectRoot, projectRoot)) {
    await visit(projectRoot)
  }
  return found.sort(Sort.CompareStrings)
}

/** isImportableFile confirms an existing Tao file stays within its real project boundary. */
export async function isImportableFile(path: string, boundary: string): Promise<boolean> {
  if (!path.endsWith('.tao') || isExcludedPath(path, boundary)) {
    return false
  }
  if (!await FS.exists(path)) {
    return false
  }
  if (!Try.WithDefault(false, () => FS.lstatSync(path).isFile())) {
    return false
  }
  return resolveRealPathInsideProject(path, boundary) !== undefined
}

function isSourceEntry(name: string, isFile: boolean): boolean {
  return isFile && name.endsWith('.tao') && !isExcludedName(name)
}

async function canDescendPackage(name: string, isDirectory: boolean, path: string): Promise<boolean> {
  return isDirectory && !name.startsWith('@') && !await FS.exists(Path.join(path, '.tao'))
}

function isSearchDirectory(name: string, isDirectory: boolean): boolean {
  return isDirectory && !isExcludedName(name) && name !== 'node_modules'
}

// isSafeDirectory confirms a directory stays within its real project boundary.
async function isSafeDirectory(path: string, boundary: string): Promise<boolean> {
  if (isExcludedPath(path, boundary) || !await FS.exists(path)) {
    return false
  }
  if (!Try.WithDefault(false, () => FS.lstatSync(path).isDirectory())) {
    return false
  }
  return resolveRealPathInsideProject(path, boundary) !== undefined
}

type SourceDirectoryEntry = { name: string; isFile(): boolean; isDirectory(): boolean }

async function readDirectoryEntries(path: string): Promise<SourceDirectoryEntry[]> {
  const fallback: SourceDirectoryEntry[] = []
  return await Try.WithDefault(fallback, () => FS.readdir(path, { withFileTypes: true }))
}
