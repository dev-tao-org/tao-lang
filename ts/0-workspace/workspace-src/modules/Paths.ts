import { Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'

/** within identifies paths whose normalized relative path stays inside a root. */
export function within(root: string, path: string): boolean {
  return Path.isWithin(root, path)
}

/** excludedPath filters hidden, generated, dependency and output paths from Tao source discovery. */
export function excludedPath(path: string, boundary: string): boolean {
  return Path.relative(boundary, path).replaceAll('\\', '/').split('/').some(excludedName)
}

/** excludedName filters directories that are not authored Tao source. */
export function excludedName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_gen') || name === 'output' || name === 'dist' || name === 'build'
}

/** nearestProjectRoot finds the closest ancestor containing a .tao directory. */
export function nearestProjectRoot(directory: string, homeDirectory = Platform.homeDirectory()): string | undefined {
  const absolute = Path.resolve(directory)
  let current = Try.WithDefault(absolute, () => FileSystem.realpathSync(absolute))
  while (true) {
    if (isDiscoverableProjectDirectory(current, homeDirectory)) {
      return current
    }
    if (FileSystem.existsSync(Path.join(current, '.git'))) {
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
export function isDiscoverableProjectDirectory(path: string, home = Platform.homeDirectory()): boolean {
  const tao = Path.join(path, '.tao')
  if (!Try.WithDefault(false, () => FileSystem.lstatSync(tao).isDirectory())) {
    return false
  }
  const isHome = canonicalPath(path) === canonicalPath(home)
  const legacyHome = isHome && !FileSystem.existsSync(Path.join(tao, 'store', 'project.json'))
  return !legacyHome
}

/** realPathInsideProject rejects symlinks that leave the owning Tao project. */
export function realPathInsideProject(path: string, projectRoot: string): string | undefined {
  return Try.WithDefault(undefined, () => {
    const realPath = FileSystem.realpathSync(path)
    const realRoot = FileSystem.realpathSync(projectRoot)
    const owner = nearestProjectRoot(realPath) ?? realRoot
    return within(realRoot, realPath) && owner === realRoot ? realPath : undefined
  })
}

/** canonicalProjectRoot accepts only a real directory root without a nested project boundary. */
export function canonicalProjectRoot(path: string): string | undefined {
  return Try.WithDefault(undefined, () => {
    if (!FileSystem.lstatSync(path).isDirectory()) {
      return undefined
    }
    const root = FileSystem.realpathSync(path)
    const owner = nearestProjectRoot(root)
    return owner === undefined || owner === root ? root : undefined
  })
}

/** namedPackageRoot finds the owning local @name package directory. */
export function namedPackageRoot(path: string, projectRoot: string): string | undefined {
  let directory = Path.dirname(path)
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

/** relationFor records the nearest source ownership boundary crossed by an import. */
export function relationFor(
  importer: string,
  target: string,
  projectRoot: string,
): 'same-file' | 'same-directory' | 'same-package' | 'same-project' {
  if (Path.resolve(importer) === Path.resolve(target)) {
    return 'same-file'
  }
  const importerPackage = namedPackageRoot(importer, projectRoot)
  const targetPackage = namedPackageRoot(target, projectRoot)
  if (importerPackage && importerPackage === targetPackage) {
    return 'same-package'
  }
  if (importerPackage !== targetPackage) {
    return 'same-project'
  }
  return 'same-directory'
}

function canonicalPath(path: string): string {
  const absolute = Path.resolve(path)
  return Try.WithDefault(absolute, () => FileSystem.realpathSync(absolute))
}
