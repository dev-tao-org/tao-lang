import { Regxs, Try, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import type * as Typecheck from '@typecheck'
import * as Catalog from './Catalog'
import type { ModuleLoadOptions } from './Loader'
import * as Paths from './Paths'

type PhysicalImporterPath = string | undefined

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

/** importTargets resolves one authored folder address to its direct source candidates. */
export async function importTargets(
  specifier: string,
  importer: string,
  physicalImporter: PhysicalImporterPath,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  const address = parsePackageAddress(specifier)
  if (address?.projectAlias) {
    return await resolveExternalTargets(address, specifier, importer, context)
  }
  if (!physicalImporter) {
    UserInput.fail(`Cannot resolve module ${specifier} from virtual source ${importer}.`)
  }
  if (address) {
    const files = await resolvePackageFiles(address, specifier, context.projectRoot)
    return files.map(path => localTarget(physicalImporter, path))
  }
  return await resolveRelativeTargets(specifier, physicalImporter, context.projectRoot)
}

type PackageAddress = { name: string; parts: string[]; projectAlias?: string }

function parsePackageAddress(specifier: string): PackageAddress | undefined {
  const [head, ...parts] = specifier.split('/')
  const name = head!
  const external = Regxs.ModuleSourceKeyRegx.exec(name)
  if (external) {
    // ex: widgets@ui/forms -> project alias widgets, package @ui, subfolder forms
    return { name: `@${external[2]!}`, parts, projectAlias: external[1]! }
  }
  if (!name.startsWith('@')) {
    return undefined
  }
  if (!Regxs.ModuleAliasRegx.test(name)) {
    UserInput.fail(`Invalid package path ${specifier}.`)
  }
  return { name, parts }
}

async function resolveExternalTargets(
  address: PackageAddress,
  specifier: string,
  importer: string,
  context: ModuleResolutionContext,
): Promise<ModuleTarget[]> {
  const alias = address.projectAlias!
  const dependency = await context.options.resolveProject?.(importer, alias)
  if (!dependency) {
    UserInput.fail(`Project dependency ${alias} is not available while resolving ${specifier}.`)
  }
  const projectRoot = Paths.resolveCanonicalProjectRoot(dependency.root)
  if (!projectRoot) {
    UserInput.fail(`Project dependency ${alias} has no valid project root.`)
  }
  const files = await resolvePackageFiles(address, specifier, projectRoot)
  return files.map(path => ({ path, relation: 'package-api', projectRoot, projectAlias: alias }))
}

async function resolvePackageFiles(
  address: PackageAddress,
  specifier: string,
  projectRoot: string,
): Promise<string[]> {
  const root = await requirePackageRoot(address, specifier, projectRoot)
  const target = Path.resolve(root, ...address.parts)
  if (Paths.findNamedPackageRoot(target, projectRoot) !== root) {
    UserInput.fail(`Package path ${specifier} crosses a named package boundary.`)
  }
  if (target !== root) {
    requireImportDirectory(target, specifier, projectRoot)
  }
  return await Catalog.listDirectSourceFiles(target, projectRoot)
}

async function requirePackageRoot(
  address: PackageAddress,
  specifier: string,
  projectRoot: string,
): Promise<string> {
  const roots = await Catalog.findNamedPackageDirectories(projectRoot, address.name)
  if (roots.length > 1) {
    UserInput.fail(`Package ${address.name} is ambiguous in project ${projectRoot}.`)
  }
  const root = roots[0]
  if (root === undefined) {
    const imported = address.projectAlias ? `Project module ${specifier}` : `Package ${address.name}`
    UserInput.fail(`${imported} was not found in project ${projectRoot}.`)
  }
  return root
}

async function resolveRelativeTargets(
  specifier: string,
  importer: string,
  projectRoot: string,
): Promise<ModuleTarget[]> {
  if (!isRelativeImport(specifier)) {
    UserInput.fail(`Import path ${specifier} must be relative or name a package.`)
  }
  const directory = Path.dirname(importer)
  const target = Path.resolve(directory, specifier)
  requireImportDirectory(target, specifier, projectRoot)
  if (Paths.findNamedPackageRoot(target, projectRoot) !== Paths.findNamedPackageRoot(directory, projectRoot)) {
    UserInput.fail(`Relative module ${specifier} crosses a named package boundary.`)
  }
  const files = await Catalog.listDirectSourceFiles(target, projectRoot)
  return files.map(path => localTarget(importer, path))
}

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier === '..'
}

function requireImportDirectory(target: string, specifier: string, projectRoot: string): void {
  if (!FS.existsSync(target)) {
    UserInput.fail(`Import folder ${specifier} was not found.`)
  }
  if (!Paths.resolveRealPathInsideProject(target, projectRoot)) {
    UserInput.fail(`Module ${specifier} leaves the owning Tao project.`)
  }
  if (!Try.WithDefault(false, () => FS.lstatSync(target).isDirectory())) {
    UserInput.fail(`Import path ${specifier} must name a folder.`)
  }
}

function localTarget(importer: string, path: string): ModuleTarget {
  return { path, relation: Paths.getImportRelation(importer, path) }
}
