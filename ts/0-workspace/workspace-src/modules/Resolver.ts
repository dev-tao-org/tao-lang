import { Errors, Regxs, Try } from '@shared'
import { FS, Path } from '@shared/os'
import type * as Typecheck from '@typecheck'
import * as Catalog from './Catalog'
import type { ModuleLoadOptions } from './Loader'
import * as Paths from './Paths'

type PhysicalImporterPath = string | undefined

/** resolveBareTargets resolves unqualified use declarations against a folder or named package. */
export async function resolveBareTargets(
  importer: string,
  physicalImporter: PhysicalImporterPath,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (!physicalImporter) {
    return []
  }
  const packageRoot = Paths.findNamedPackageRoot(importer, context.projectRoot)
  const paths = packageRoot
    ? await Catalog.listRecursiveSourceFiles(packageRoot, packageRoot, context.projectRoot)
    : await Catalog.listDirectSourceFiles(Path.dirname(physicalImporter), context.projectRoot)
  return paths.filter(path => path !== importer).map(path => ({
    path,
    relation: Paths.getImportRelation(importer, path, context.projectRoot),
  }))
}

/** ModuleTarget identifies one discovered source and its visibility relation to the importer. */
export type ModuleTarget = {
  path: string
  relation: Typecheck.SourceModule['imports'][number]['targets'][number]['relation']
  source?: string
  projectRoot?: string
  projectAlias?: string
}

/** ModuleResolutionContext contains the owning project boundary and dependency resolver. */
export type ModuleResolutionContext = { projectRoot: string; options: ModuleLoadOptions }

/** importTargets resolves one authored module path to its source candidates. */
export async function importTargets(
  specifier: string,
  importer: string,
  physicalImporter: PhysicalImporterPath,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  const importedProject = parseProjectImport(specifier)
  if (importedProject) {
    return await resolveProjectModuleTargets(importedProject, specifier, importer, context)
  }
  if (specifier.startsWith('@')) {
    const [name, ...parts] = specifier.split('/')
    if (!Regxs.ModuleAliasRegx.test(name!)) {
      Errors.ThrowUserInput(`Invalid module path ${specifier}.`)
    }
    return await resolveNamedTargets(name!, parts, importer, physicalImporter, context)
  }
  return await relativeTargets(specifier, importer, physicalImporter, context)
}

type ProjectImport = { alias: string; module: string; parts: string[] }

async function resolveProjectModuleTargets(
  imported: ProjectImport,
  specifier: string,
  importer: string,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  const dependency = await context.options.resolveProject?.(importer, imported.alias)
  if (!dependency) {
    Errors.ThrowUserInput(`Project dependency ${imported.alias} is not available while resolving ${specifier}.`)
  }
  const projectRoot = Paths.resolveCanonicalProjectRoot(dependency.root)
  if (!projectRoot) {
    Errors.ThrowUserInput(`Project dependency ${imported.alias} has no valid project root.`)
  }
  const packageName = `@${imported.module}`
  const packageRoots = (await Catalog.findNamedPackageDirectories(projectRoot, packageName))
    .filter(path => Paths.resolveRealPathInsideProject(path, projectRoot) !== undefined)
  if (packageRoots.length > 1) {
    Errors.ThrowUserInput(`Package ${packageName} is ambiguous in project ${projectRoot}.`)
  }
  const packageRoot = packageRoots[0]
  if (!packageRoot) {
    Errors.ThrowUserInput(`Project module ${specifier} was not found.`)
  }
  const targetDirectory = Path.resolve(packageRoot, ...imported.parts)
  if (!Paths.within(packageRoot, targetDirectory)) {
    Errors.ThrowUserInput(`Project module path escapes ${imported.module}.`)
  }
  if (!await FS.exists(targetDirectory)) {
    Errors.ThrowUserInput(`Project module ${specifier} was not found.`)
  }
  const files = imported.parts.length === 0
    ? await Catalog.listRecursiveSourceFiles(targetDirectory, packageRoot, projectRoot)
    : await Catalog.listDirectSourceFiles(targetDirectory, projectRoot)
  const projectAlias = imported.alias
  return files.map(path => ({ path, relation: 'public', projectRoot, projectAlias }))
}

async function relativeTargets(
  specifier: string,
  importer: string,
  physicalImporter: PhysicalImporterPath,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (!physicalImporter) {
    Errors.ThrowUserInput(`Cannot resolve relative module ${specifier} from ${importer}.`)
  }
  const target = Path.resolve(Path.dirname(importer), specifier)
  const files = await listDirectImportFiles(target, context.projectRoot)
  requireRelativeModuleWithinPackage(files, importer, specifier, context.projectRoot)
  if (files.length === 0) {
    await requireRelativeTargetExists(target, specifier, importer)
  }
  if (files.length === 0) {
    if (!Paths.resolveRealPathInsideProject(target, context.projectRoot)) {
      Errors.ThrowUserInput(`Module ${specifier} leaves the owning Tao project.`)
    }
    if (!Try.WithDefault(false, () => FS.statSync(target).isDirectory())) {
      Errors.ThrowUserInput(`Module path ${specifier} does not identify a Tao file or directory.`)
    }
  }
  return files.map(path => ({ path, relation: Paths.getImportRelation(importer, path, context.projectRoot) }))
}

function requireRelativeModuleWithinPackage(
  files: readonly string[],
  importer: string,
  specifier: string,
  projectRoot: string,
): void {
  const sourcePackage = Paths.findNamedPackageRoot(importer, projectRoot)
  if (files.some(path => Paths.findNamedPackageRoot(path, projectRoot) !== sourcePackage)) {
    Errors.ThrowUserInput(`Relative module ${specifier} crosses a named package boundary.`)
  }
}

async function requireRelativeTargetExists(
  target: string,
  specifier: string,
  importer: string,
): Promise<void> {
  if (!await FS.exists(target)) {
    Errors.ThrowUserInput(`Cannot resolve module ${specifier} from ${importer}.`)
  }
}

async function resolveNamedTargets(
  name: string,
  parts: string[],
  importer: string,
  physicalImporter: PhysicalImporterPath,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  if (!physicalImporter) {
    Errors.ThrowUserInput(`Cannot resolve package ${name} from virtual source ${importer}.`)
  }
  const packages = (await Catalog.findNamedPackageDirectories(context.projectRoot, name))
    .filter(path => Paths.resolveRealPathInsideProject(path, context.projectRoot) !== undefined)
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
  if (!Paths.within(packageRoot, targetDirectory)) {
    Errors.ThrowUserInput(`Package subpath escapes ${name}.`)
  }
  const files = parts.length === 0
    ? await Catalog.listRecursiveSourceFiles(targetDirectory, packageRoot, context.projectRoot)
    : await Catalog.listDirectSourceFiles(targetDirectory, context.projectRoot)
  if (parts.length > 0 && !await FS.exists(targetDirectory)) {
    Errors.ThrowUserInput(`Package directory ${name}/${parts.join('/')} was not found.`)
  }
  return files.map(path => ({
    path,
    relation: Paths.getImportRelation(importer, path, context.projectRoot),
  }))
}

function parseProjectImport(specifier: string): ProjectImport | undefined {
  // ex: x@ui/forms -> { alias: x, module: ui, parts: [forms] }
  const [segment, ...parts] = specifier.split('/')
  const match = Regxs.ModuleSourceKeyRegx.exec(segment!)
  return match ? { alias: match[1]!, module: match[2]!, parts } : undefined
}

async function listDirectImportFiles(target: string, projectRoot: string): Promise<string[]> {
  const file = target.endsWith('.tao') ? target : `${target}.tao`
  if (await Catalog.isImportableFile(file, projectRoot)) {
    return [file]
  }
  return target.endsWith('.tao') ? [] : await Catalog.listDirectSourceFiles(target, projectRoot)
}
