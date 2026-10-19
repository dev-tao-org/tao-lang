import { Errors, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import { directSourceFiles, importableFile, namedPackageDirectories, recursiveSourceFiles } from './Catalog'
import type { ModuleLoadOptions } from './Loader'
import { canonicalProjectRoot, namedPackageRoot, realPathInsideProject, relationFor, within } from './Paths'

/** ModuleTarget identifies one discovered source and its visibility relation to the importer. */
export type ModuleTarget = {
  path: string
  relation: SourceModule['imports'][number]['targets'][number]['relation']
  source?: string
  projectRoot?: string
}

/** ModuleResolutionContext contains the owning project boundary and dependency resolver. */
export type ModuleResolutionContext = { projectRoot: string; options: ModuleLoadOptions }

/** importTargets resolves one authored module path to its source candidates. */
export async function importTargets(
  specifier: string,
  importer: string,
  physicalImporter: string | undefined,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  const importedProject = projectImport(specifier)
  if (importedProject) {
    return await projectModuleTargets(importedProject, specifier, importer, context)
  }
  if (specifier.startsWith('@')) {
    const [name, ...parts] = specifier.split('/')
    if (!/^@[A-Za-z_][\w.-]*$/.test(name!)) {
      Errors.ThrowUserInput(`Invalid module path ${specifier}.`)
    }
    return await namedTargets(name!, parts, importer, physicalImporter, context)
  }
  return await relativeTargets(specifier, importer, physicalImporter, context)
}

async function projectModuleTargets(
  imported: { alias: string; module: string; parts: string[] },
  specifier: string,
  importer: string,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  const dependency = await context.options.resolveProject?.(importer, imported.alias)
  if (!dependency) {
    Errors.ThrowUserInput(`Project dependency ${imported.alias} is not available while resolving ${specifier}.`)
  }
  const projectRoot = canonicalProjectRoot(dependency.root)
  if (!projectRoot) {
    Errors.ThrowUserInput(`Project dependency ${imported.alias} has no valid project root.`)
  }
  const packageName = `@${imported.module}`
  const packageRoots = (await namedPackageDirectories(projectRoot, packageName))
    .filter(path => realPathInsideProject(path, projectRoot) !== undefined)
  if (packageRoots.length > 1) {
    Errors.ThrowUserInput(`Package ${packageName} is ambiguous in project ${projectRoot}.`)
  }
  const packageRoot = packageRoots[0]
  if (!packageRoot) {
    Errors.ThrowUserInput(`Project module ${specifier} was not found.`)
  }
  const targetDirectory = Path.resolve(packageRoot, ...imported.parts)
  if (!within(packageRoot, targetDirectory)) {
    Errors.ThrowUserInput(`Project module path escapes ${imported.module}.`)
  }
  if (!await FileSystem.exists(targetDirectory)) {
    Errors.ThrowUserInput(`Project module ${specifier} was not found.`)
  }
  const files = imported.parts.length === 0
    ? await recursiveSourceFiles(targetDirectory, packageRoot, projectRoot)
    : await directSourceFiles(targetDirectory, projectRoot)
  return files.map(path => ({ path, relation: 'public', projectRoot }))
}

async function relativeTargets(
  specifier: string,
  importer: string,
  physicalImporter: string | undefined,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
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

function projectImport(specifier: string): { alias: string; module: string; parts: string[] } | undefined {
  const [segment, ...parts] = specifier.split('/')
  const match = /^([A-Za-z0-9_-]+)@([A-Za-z_][\w.-]*)$/.exec(segment!)
  return match ? { alias: match[1]!, module: match[2]!, parts } : undefined
}

async function directImportFiles(target: string, projectRoot: string): Promise<string[]> {
  const file = target.endsWith('.tao') ? target : `${target}.tao`
  if (await importableFile(file, projectRoot)) {
    return [file]
  }
  return target.endsWith('.tao') ? [] : await directSourceFiles(target, projectRoot)
}
