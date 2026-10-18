import { Errors, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import { directSourceFiles, importableFile, namedPackageDirectories, recursiveSourceFiles } from './Catalog'
import type { ModuleLoadOptions } from './Loader'
import { namedPackageRoot, realPathInsideProject, relationFor, within } from './Paths'

/** ModuleTarget identifies one discovered source and its visibility relation to the importer. */
export type ModuleTarget = {
  path: string
  relation: SourceModule['imports'][number]['targets'][number]['relation']
  source?: string
}

/** ModuleResolutionContext contains the project boundary and configured standard library. */
export type ModuleResolutionContext = { projectRoot: string; options: ModuleLoadOptions }

/** importTargets resolves one authored module path to its source candidates. */
export async function importTargets(
  specifier: string,
  importer: string,
  physicalImporter: string | undefined,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (specifier.startsWith('@tao/')) {
    const resolved = await stdlibTargets(specifier, context.options)
    if (resolved.targets.length === 0 && !resolved.exists) {
      Errors.ThrowUserInput(`Cannot resolve standard library module ${specifier}.`)
    }
    return resolved.targets.map(target => ({ ...target, relation: 'public' }))
  }
  if (specifier.startsWith('@')) {
    const [name, ...parts] = specifier.split('/')
    if (!/^@[A-Za-z_][\w.-]*$/.test(name!) || name === '@tao') {
      Errors.ThrowUserInput(`Invalid module path ${specifier}.`)
    }
    return await namedTargets(name!, parts, importer, physicalImporter, context)
  }
  if (!physicalImporter) {
    Errors.ThrowUserInput(`Cannot resolve relative module ${specifier} from ${importer}.`)
  }
  const target = Path.resolve(Path.dirname(importer), specifier)
  const files = await directImportFiles(target, context.projectRoot)
  const sourcePackage = namedPackageRoot(importer, context.projectRoot)
  if (
    files.some(path =>
      namedPackageRoot(path, context.projectRoot) !== sourcePackage
      && namedPackageRoot(path, context.projectRoot) !== undefined
    )
  ) {
    Errors.ThrowUserInput(`Relative module ${specifier} crosses a named package boundary.`)
  }
  if (files.length === 0 && !await FileSystem.exists(target)) {
    Errors.ThrowUserInput(`Cannot resolve module ${specifier} from ${importer}.`)
  }
  if (files.length === 0) {
    if (!realPathInsideProject(target, context.projectRoot)) {
      Errors.ThrowUserInput(`Module ${specifier} leaves the owning Tao project.`)
    }
    if (!Try.WithDefault(false, () => FileSystem.statSync(target).isDirectory())) {
      Errors.ThrowUserInput(`Module path ${specifier} does not identify a Tao file or directory.`)
    }
  }
  return files.map(path => ({ path, relation: relationFor(importer, path, context.projectRoot) }))
}

/** bareTargets resolves unqualified use declarations against the direct folder or named package. */
export async function bareTargets(
  importer: string,
  physicalImporter: string | undefined,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (!physicalImporter) {
    return []
  }
  const packageRoot = namedPackageRoot(importer, context.projectRoot)
  const paths = packageRoot
    ? await recursiveSourceFiles(packageRoot, packageRoot, context.projectRoot)
    : await directSourceFiles(Path.dirname(physicalImporter), context.projectRoot)
  return paths.filter(path => path !== importer).map(path => ({
    path,
    relation: packageRoot ? 'same-package' : 'same-directory',
  }))
}

async function namedTargets(
  name: string,
  parts: string[],
  importer: string,
  physicalImporter: string | undefined,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (!physicalImporter) {
    Errors.ThrowUserInput(`Cannot resolve package ${name} from virtual source ${importer}.`)
  }
  const packages = (await namedPackageDirectories(context.projectRoot, name))
    .filter(path => realPathInsideProject(path, context.projectRoot) !== undefined)
  if (packages.length > 1) {
    Errors.ThrowUserInput(`Package ${name} is ambiguous in project ${context.projectRoot}.`)
  }
  const packageRoot = packages[0]
  if (!packageRoot) {
    Errors.ThrowUserInput(`Package ${name} was not found in project ${context.projectRoot}.`)
  }
  if (parts.length > 0 && parts.at(-1)!.endsWith('.tao')) {
    Errors.ThrowUserInput(`Package subpaths must name directories: ${name}/${parts.join('/')}.`)
  }
  const targetDirectory = Path.resolve(packageRoot, ...parts)
  if (!within(packageRoot, targetDirectory)) {
    Errors.ThrowUserInput(`Package subpath escapes ${name}.`)
  }
  const files = parts.length === 0
    ? await recursiveSourceFiles(targetDirectory, packageRoot, context.projectRoot)
    : await directSourceFiles(targetDirectory, context.projectRoot)
  if (parts.length > 0 && !await FileSystem.exists(targetDirectory)) {
    Errors.ThrowUserInput(`Package directory ${name}/${parts.join('/')} was not found.`)
  }
  return files.map(path => ({
    path,
    relation: namedPackageRoot(importer, context.projectRoot) === packageRoot ? 'same-package' : 'same-project',
  }))
}

async function directImportFiles(target: string, projectRoot: string): Promise<string[]> {
  const file = target.endsWith('.tao') ? target : `${target}.tao`
  if (await importableFile(file, projectRoot)) {
    return [file]
  }
  return target.endsWith('.tao') ? [] : await directSourceFiles(target, projectRoot)
}

async function stdlibTargets(
  specifier: string,
  options: ModuleLoadOptions,
): Promise<{ exists: boolean; targets: Array<{ path: string; source: string }> }> {
  const relative = specifier.slice('@tao/'.length)
  const files = [...options.stdlibSources.keys()]
  const directorySuffix = `/@tao/${relative}`
  const exactSuffix = relative.endsWith('.tao') ? relative : `${relative}.tao`
  const authoredRoot = options.stdlibDirectory
  const authoredAvailable = authoredRoot && isDirectory(authoredRoot)
  let paths: string[]
  let exists = false
  if (authoredAvailable) {
    const physicalTarget = Path.resolve(authoredRoot, '@tao', relative)
    exists = await FileSystem.exists(physicalTarget)
    if (!isStdlibTarget(authoredRoot, physicalTarget, exists)) {
      return { exists: false, targets: [] }
    }
    const directory = Try.WithDefault(false, () => FileSystem.statSync(physicalTarget).isDirectory())
    paths = directory
      ? files.filter(path => Path.dirname(path).endsWith(directorySuffix))
      : files.filter(path => path.endsWith(`/@tao/${exactSuffix}`))
  } else {
    const directoryFiles = relative.endsWith('.tao')
      ? []
      : files.filter(path => Path.dirname(path).endsWith(directorySuffix))
    paths = directoryFiles.length > 0
      ? directoryFiles
      : files.filter(path => path.endsWith(`/@tao/${exactSuffix}`))
    exists = paths.length > 0
  }
  const targets = await Promise.all(paths.map(async path => {
    const physical = physicalFileFor(path, options)
    if (authoredAvailable && (!physical || !await FileSystem.exists(physical))) {
      Errors.ThrowUserInput(`Standard library source is missing from ${authoredRoot}: ${path}.`)
    }
    const source = physical && await FileSystem.exists(physical)
      ? await FileSystem.readFile(physical, 'utf8')
      : options.stdlibSources.get(path)!
    return { path, source }
  }))
  return { exists, targets }
}

function isDirectory(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.statSync(path).isDirectory())
}

function isStdlibTarget(root: string, target: string, exists: boolean): boolean {
  const packageRoot = Path.resolve(root, '@tao')
  return exists && within(packageRoot, target)
    && realPathInsideDirectory(packageRoot, root) && realPathInsideDirectory(target, packageRoot)
}

function physicalFileFor(sourcePath: string, options: ModuleLoadOptions): string | undefined {
  const root = options.stdlibDirectory
  const marker = '/@tao/'
  const index = sourcePath.lastIndexOf(marker)
  return root && index >= 0 ? Path.resolve(root, '@tao', sourcePath.slice(index + marker.length)) : undefined
}

function realPathInsideDirectory(path: string, root: string): boolean {
  const realPath = Try.WithDefault(undefined, () => FileSystem.realpathSync(path))
  const realRoot = Try.WithDefault(undefined, () => FileSystem.realpathSync(root))
  return realPath !== undefined && realRoot !== undefined && within(realRoot, realPath)
}
