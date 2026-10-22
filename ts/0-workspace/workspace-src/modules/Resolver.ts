import { Errors, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import {
  findNamedPackageDirectories,
  isImportableFile,
  listDirectSourceFiles,
  listRecursiveSourceFiles,
} from './Catalog'
import type { ModuleLoadOptions } from './Loader'
import {
  findNamedPackageRoot,
  getImportRelation,
  resolveCanonicalProjectRoot,
  resolveRealPathInsideProject,
  within,
} from './Paths'

/** resolveBareTargets resolves unqualified use declarations against a folder or named package. */
export async function resolveBareTargets(
  importer: string,
  physicalImporter: string | undefined,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (!physicalImporter) {
    return []
  }
  const packageRoot = findNamedPackageRoot(importer, context.projectRoot)
  const paths = packageRoot
    ? await listRecursiveSourceFiles(packageRoot, packageRoot, context.projectRoot)
    : await listDirectSourceFiles(Path.dirname(physicalImporter), context.projectRoot)
  return paths.filter(path => path !== importer).map(path => ({
    path,
    relation: packageRoot ? 'same-package' : 'same-directory',
  }))
}

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
    return await resolveProjectModuleTargets(importedProject, specifier, importer, context)
  }
  if (specifier.startsWith('@')) {
    const [name, ...parts] = specifier.split('/')
    if (!/^@[A-Za-z_][\w.-]*$/.test(name!)) {
      Errors.ThrowUserInput(`Invalid module path ${specifier}.`)
    }
    return await resolveNamedTargets(name!, parts, importer, physicalImporter, context)
  }
  return await relativeTargets(specifier, importer, physicalImporter, context)
}

async function resolveProjectModuleTargets(
  imported: { alias: string; module: string; parts: string[] },
  specifier: string,
  importer: string,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  const dependency = await context.options.resolveProject?.(importer, imported.alias)
  if (!dependency) {
    Errors.ThrowUserInput(`Project dependency ${imported.alias} is not available while resolving ${specifier}.`)
  }
  const projectRoot = resolveCanonicalProjectRoot(dependency.root)
  if (!projectRoot) {
    Errors.ThrowUserInput(`Project dependency ${imported.alias} has no valid project root.`)
  }
  const packageName = `@${imported.module}`
  const packageRoots = (await findNamedPackageDirectories(projectRoot, packageName))
    .filter(path => resolveRealPathInsideProject(path, projectRoot) !== undefined)
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
    ? await listRecursiveSourceFiles(targetDirectory, packageRoot, projectRoot)
    : await listDirectSourceFiles(targetDirectory, projectRoot)
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
  const files = await listDirectImportFiles(target, context.projectRoot)
  const sourcePackage = findNamedPackageRoot(importer, context.projectRoot)
  if (
    files.some(path =>
      findNamedPackageRoot(path, context.projectRoot) !== sourcePackage
      && findNamedPackageRoot(path, context.projectRoot) !== undefined
    )
  ) {
    Errors.ThrowUserInput(`Relative module ${specifier} crosses a named package boundary.`)
  }
  if (files.length === 0 && !await FileSystem.exists(target)) {
    Errors.ThrowUserInput(`Cannot resolve module ${specifier} from ${importer}.`)
  }
  if (files.length === 0) {
    if (!resolveRealPathInsideProject(target, context.projectRoot)) {
      Errors.ThrowUserInput(`Module ${specifier} leaves the owning Tao project.`)
    }
    if (!Try.WithDefault(false, () => FileSystem.statSync(target).isDirectory())) {
      Errors.ThrowUserInput(`Module path ${specifier} does not identify a Tao file or directory.`)
    }
  }
  return files.map(path => ({ path, relation: getImportRelation(importer, path, context.projectRoot) }))
}

async function resolveNamedTargets(
  name: string,
  parts: string[],
  importer: string,
  physicalImporter: string | undefined,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (!physicalImporter) {
    Errors.ThrowUserInput(`Cannot resolve package ${name} from virtual source ${importer}.`)
  }
  const packages = (await findNamedPackageDirectories(context.projectRoot, name))
    .filter(path => resolveRealPathInsideProject(path, context.projectRoot) !== undefined)
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
    ? await listRecursiveSourceFiles(targetDirectory, packageRoot, context.projectRoot)
    : await listDirectSourceFiles(targetDirectory, context.projectRoot)
  if (parts.length > 0 && !await FileSystem.exists(targetDirectory)) {
    Errors.ThrowUserInput(`Package directory ${name}/${parts.join('/')} was not found.`)
  }
  return files.map(path => ({
    path,
    relation: findNamedPackageRoot(importer, context.projectRoot) === packageRoot ? 'same-package' : 'same-project',
  }))
}

function projectImport(specifier: string): { alias: string; module: string; parts: string[] } | undefined {
  // ex: x@ui/forms -> { alias: x, module: ui, parts: [forms] }
  const [segment, ...parts] = specifier.split('/')
  const match = /^([A-Za-z0-9_-]+)@([A-Za-z_][\w.-]*)$/.exec(segment!)
  return match ? { alias: match[1]!, module: match[2]!, parts } : undefined
}

async function listDirectImportFiles(target: string, projectRoot: string): Promise<string[]> {
  const file = target.endsWith('.tao') ? target : `${target}.tao`
  if (await isImportableFile(file, projectRoot)) {
    return [file]
  }
  return target.endsWith('.tao') ? [] : await listDirectSourceFiles(target, projectRoot)
}
