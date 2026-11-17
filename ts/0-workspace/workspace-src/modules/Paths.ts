import { Try } from '@shared'
import { FS, Path } from '@shared/os'

/** within identifies paths whose normalized relative path stays inside a root. */
export function within(root: string, path: string): boolean {
  return Path.isWithin(root, path)
}

/** isExcludedPath filters hidden, generated, dependency and output paths from Tao source discovery. */
export function isExcludedPath(path: string, boundary: string): boolean {
  return Path.relative(boundary, path).replaceAll('\\', '/').split('/').some(isExcludedName)
}

/** isExcludedName filters directories that are not authored Tao source. */
export function isExcludedName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_gen') || ExcludedBuildDirectoryNames.has(name)
}

/** findNearestProjectRoot finds the closest ancestor containing a .tao directory. */
export function findNearestProjectRoot(
  directory: string,
  homeDirectory = Path.home(),
): string | undefined {
  const absolute = Path.resolve(directory)
  let current = Try.WithDefault(absolute, () => FS.realpathSync(absolute))
  while (true) {
    if (isDiscoverableProjectDirectory(current, homeDirectory)) {
      return current
    }
    if (FS.existsSync(Path.join(current, '.git'))) {
      return undefined
    }
    const parent = Path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

/** isDiscoverableProjectDirectory excludes legacy home cache directories from project boundaries. */
export function isDiscoverableProjectDirectory(path: string, home = Path.home()): boolean {
  const tao = Path.join(path, '.tao')
  if (!Try.WithDefault(false, () => FS.lstatSync(tao).isDirectory())) {
    return false
  }
  const isHome = resolveCanonicalPath(path) === resolveCanonicalPath(home)
  const legacyHome = isHome && !FS.existsSync(Path.join(tao, 'store', 'project.json'))
  return !legacyHome
}

/** resolveRealPathInsideProject rejects symlinks that leave the owning Tao project. */
export function resolveRealPathInsideProject(path: string, projectRoot: string): string | undefined {
  return Try.WithDefault(undefined, () => {
    const realPath = FS.realpathSync(path)
    const realRoot = FS.realpathSync(projectRoot)
    const owner = findNearestProjectRoot(realPath) ?? realRoot
    return within(realRoot, realPath) && owner === realRoot ? realPath : undefined
  })
}

/** resolveCanonicalProjectRoot accepts only a real directory root without a nested project boundary. */
export function resolveCanonicalProjectRoot(path: string): string | undefined {
  return Try.WithDefault(undefined, () => {
    if (!FS.lstatSync(path).isDirectory()) {
      return undefined
    }
    const root = FS.realpathSync(path)
    const owner = findNearestProjectRoot(root)
    return owner === undefined || owner === root ? root : undefined
  })
}

/** findNamedPackageRoot finds the closest local @name package containing a directory. */
export function findNamedPackageRoot(directory: string, projectRoot: string): string | undefined {
  while (within(projectRoot, directory)) {
    const name = Path.basename(directory)
    if (name.startsWith('@')) {
      return directory
    }
    if (directory === projectRoot) {
      break
    }
    directory = Path.dirname(directory)
  }
  return undefined
}

type ImportRelation = 'same-file' | 'same-directory' | 'package-api'
/** getImportRelation records the nearest source ownership boundary crossed by an import. */
export function getImportRelation(importer: string, target: string): ImportRelation {
  const importerPath = Path.resolve(importer)
  const targetPath = Path.resolve(target)
  if (importerPath === targetPath) {
    return 'same-file'
  }
  if (Path.dirname(importerPath) === Path.dirname(targetPath)) {
    return 'same-directory'
  }
  return 'package-api'
}

/** resolveCanonicalPath preserves an absent suffix below its canonical existing ancestor.
 *  Other filesystem failures retain the absolute lexical path for the owning operation to diagnose. */
export function resolveCanonicalPath(path: string): string {
  const absolute = Path.resolve(path)
  return Try(() => FS.realpathSync(absolute), {
    catch: error => isAbsentPath(error) ? resolveAbsentPath(absolute) : absolute,
  })
}

const ExcludedBuildDirectoryNames = new Set(['output', 'dist', 'build'])
const AbsentPathErrorCode = 'ENOENT'

function isAbsentPath(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === AbsentPathErrorCode
}

function resolveAbsentPath(path: string): string {
  const parent = Path.dirname(path)
  if (parent === path) {
    return path
  }
  return Path.join(resolveCanonicalPath(parent), Path.basename(path))
}
