import * as AST from '@ast-gen'
import * as Compile from '@compile'
import * as Grammar from '@grammar'
import * as Runtime from '@runtime'
import { Errors, Lists, Try } from '@shared'
import * as SourceValidation from '@source-validation'
import * as Stdlib from '@stdlib'
import * as Typecheck from '@typecheck'

import { FS, Path } from '@shared/os'

import { createProjectDependencyOptions } from './dependencies/Options'
import { collectModuleRequirements } from './ModuleRequirements'
import { findNamedPackageDirectories, listRecursiveSourceFiles } from './modules/Catalog'
import { loadModules } from './modules/Loader'
import { findNearestProjectRoot } from './modules/Paths'
import { isNpmPackageName } from './NpmPackageName'
import { ProjectDependencies } from './ProjectDependencies'
import { captureLibrarySidecars, type LibrarySidecars } from './SidecarPipeline'

/** LibraryPackageRequest selects the authored entry and isolated output package. */
export type LibraryPackageRequest = { entry: string; out: string; name: string; target?: string }

/** compileLibraryPackage emits a relocatable TypeScript source package with ordinary package exports. */
export async function compileLibraryPackage(request: LibraryPackageRequest): Promise<string> {
  requireLibraryPackageRequest(request)
  const entry = FS.realpathSync(Path.resolve(request.entry))
  const root = findNearestProjectRoot(Path.dirname(entry)) ?? Path.dirname(entry)
  const parser = Grammar.createParser()
  const document = AST.transform(parser.parse(await FS.readFile(entry, 'utf8')))
  if (!document) {
    Errors.ThrowUserInput(`Invalid Tao library syntax: ${entry}.`)
  }
  SourceValidation.assertValidStatements(document, entry)
  const publication = Compile.requireLibraryPublication(document, request.target)
  const packageRoots = await resolvePublishedPackageRoots(root, publication)
  const includedSources = await listPublishedPackageSources(root, packageRoots)
  const dependencies = new ProjectDependencies(root, await createProjectDependencyOptions(root))
  await dependencies.refresh()
  const modules = await loadModules({ path: entry, document }, {
    directory: root,
    includedSources,
    includeModuleRequirements: true,
    observeProjectSources: (owner, sources) => dependencies.observeProjectSources(owner, sources),
    resolveProject: async (importer, alias) =>
      alias === 'tao'
        ? { root: await Stdlib.projectDirectory() }
        : await dependencies.resolveProject(importer, alias),
  }, parser)
  const ownSources = new Set(modules.filter(module => module.project?.root === root).map(module => module.path))
  const program = Typecheck.linkModules(entry, modules)
  const sidecars = await captureLibrarySidecars(program, root, packageRoots)
  const selection = { declaration: publication, ownSources, packageRoots }
  const library = Compile.compileLibrary(program, selection, sidecars.resolveImport)
  const packageFiles = await compileLibraryFiles(library, program, request.name)
  const output = Path.resolve(request.out)
  await FS.mkdir(Path.dirname(output))
  await FS.createExclusiveDirectory(output)
  await Try(() => writeLibraryPackage(output, packageFiles, sidecars.files), {
    catch: error => removeFailedLibraryOutput(output, error),
  })
  return output
}

async function resolvePublishedPackageRoots(
  root: string,
  publication: AST.PublishDeclaration,
): Promise<Map<string, string>> {
  const names = publication.members.map(member => member.value).filter(name => name.startsWith('@'))
  const packages = new Map<string, string>()
  for (const name of Lists.unique(names)) {
    const candidates = await findNamedPackageDirectories(root, name)
    if (candidates.length !== 1) {
      Errors.ThrowUserInput(`Published package ${name} must identify one local Tao package.`)
    }
    packages.set(name, candidates[0]!)
  }
  return packages
}

async function listPublishedPackageSources(root: string, packages: ReadonlyMap<string, string>): Promise<string[]> {
  const sources = await Promise.all(
    [...packages.values()].map(directory => listRecursiveSourceFiles(directory, directory, root)),
  )
  return sources.flat()
}

async function compileLibraryFiles(
  library: Compile.CompiledLibrary,
  program: Typecheck.LinkedProgram,
  name: string,
): Promise<Compile.CompiledFiles> {
  const pins = await Runtime.runtimeDependencies()
  const peerDependencies = {
    [Runtime.RuntimeLibraryPackageName]: Runtime.RuntimeLibraryPackageVersion,
    'react': pins.react!,
    'react-native': pins['react-native']!,
  }
  const packageFiles = Compile.compileLibraryPackageFiles(library.views, {
    name,
    peerDependencies,
    dependencies: collectLibraryDependencies(program, peerDependencies),
  })
  return { ...library.files, ...packageFiles }
}

function collectLibraryDependencies(
  program: Typecheck.LinkedProgram,
  peers: Runtime.RuntimePackageVersions,
): Runtime.RuntimePackageVersions {
  const dependencies = new Map<string, string>()
  for (const module of program.modules) {
    for (const { name, version } of collectModuleRequirements(module.document, module.path)) {
      const existing = peers[name] ?? dependencies.get(name)
      if (existing !== undefined && existing !== version) {
        Errors.ThrowUserInput(
          `Library dependencies request conflicting versions of ${name}: ${existing} and ${version}.`,
        )
      }
      if (!peers[name]) {
        dependencies.set(name, version)
      }
    }
  }
  return Object.fromEntries(dependencies)
}

async function writeLibraryPackage(
  output: string,
  files: Compile.CompiledFiles,
  sidecars: LibrarySidecars['files'],
): Promise<void> {
  for (const [name, source] of [...Object.entries(files), ...sidecars]) {
    const target = Path.join(output, name)
    await FS.mkdir(Path.dirname(target))
    await FS.writeFile(target, source)
  }
}

async function removeFailedLibraryOutput(output: string, buildError: unknown): Promise<never> {
  await Try(() => FS.rm(output, { recursive: true, force: true }), {
    catch: cleanupError =>
      Errors.ThrowHostEnvironment(
        `Library compilation failed and its incomplete output could not be removed: ${output}.`,
        { cause: buildError, details: { cleanupError } },
      ),
  })
  Errors.Throw(buildError)
}

function requireLibraryPackageRequest(request: LibraryPackageRequest): void {
  if (!request.out || !request.name || !isNpmPackageName(request.name)) {
    Errors.ThrowUserInput('Library compilation requires an output directory and a valid package name.')
  }
  const output = Path.resolve(request.out)
  if (FS.existsSync(output)) {
    Errors.ThrowUserInput(`Library output already exists: ${output}. Choose a fresh output directory.`)
  }
}
