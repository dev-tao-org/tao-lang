import * as AST from '@ast-gen'
import * as Compile from '@compile'
import * as Grammar from '@grammar'
import { Errors, Json, Try } from '@shared'
import * as SourceValidation from '@source-validation'
import * as Stdlib from '@stdlib'
import * as Typecheck from '@typecheck'

import { Bundle, FS, Path, Repo } from '@shared/os'

import { createProjectDependencyOptions } from './dependencies/Options'
import { loadModules } from './modules/Loader'
import { findNearestProjectRoot } from './modules/Paths'
import { isNpmPackageName } from './NpmPackageName'
import { ProjectDependencies } from './ProjectDependencies'

/** LibraryPackageRequest selects the authored entry and isolated output package. */
export type LibraryPackageRequest = { entry: string; out: string; name: string; target?: string }

/** compileLibraryPackage emits compiled Tao JS and precise public declarations with ordinary package exports. */
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
  const dependencies = new ProjectDependencies(root, await createProjectDependencyOptions(root))
  await dependencies.refresh()
  const modules = await loadModules({ path: entry, document }, {
    directory: root,
    observeProjectSources: (owner, sources) => dependencies.observeProjectSources(owner, sources),
    resolveProject: async (importer, alias) =>
      alias === 'tao'
        ? { root: await Stdlib.projectDirectory() }
        : await dependencies.resolveProject(importer, alias),
  }, parser)
  const ownSources = new Set(modules.filter(module => isOwnProjectSource(root, module.path)).map(module => module.path))
  const library = Compile.compileLibrary(Typecheck.linkModules(entry, modules), ownSources, request.target)
  const output = Path.resolve(request.out)
  await FS.mkdir(Path.dirname(output))
  await FS.createExclusiveDirectory(output)
  await Try(() => writeLibraryPackage(output, library, request.name), {
    catch: error => removeFailedLibraryOutput(output, error),
  })
  return output
}

async function writeLibraryPackage(output: string, library: Compile.CompiledLibrary, name: string): Promise<void> {
  const sources = Path.join(output, 'source')
  await writeGeneratedSources(sources, library.files)
  const configuration = Path.join(sources, 'tsconfig.json')
  await FS.writeFile(configuration, serializeLibraryBuildConfiguration())
  await Bundle.bundleLibrary(Path.join(sources, 'Library.ts'), output, configuration)
  const packageFiles = Compile.compileLibraryPackageFiles(library.views, {
    name,
    peerDependencies: { 'react': '19.2.3', 'react-native': '0.86.3' },
    dependencies: { '@preact/signals-core': '1.14.4' },
  })
  for (const [name, source] of Object.entries(packageFiles)) {
    await FS.writeFile(Path.join(output, name), source)
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

function isOwnProjectSource(root: string, source: string): boolean {
  const owner = findNearestProjectRoot(Path.dirname(source)) ?? root
  return Path.isWithin(root, source) && owner === root
}

async function writeGeneratedSources(directory: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [name, source] of Object.entries(files)) {
    const target = Path.join(directory, name)
    await FS.mkdir(Path.dirname(target))
    await FS.writeFile(target, source)
  }
}

function serializeLibraryBuildConfiguration(): string {
  return Json.Print({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      esModuleInterop: true,
      jsx: 'react-jsx',
      paths: {
        '@runtime': [Repo.resolvePath('ts/7-runtime/runtime-src/client/TR.ts')],
        '@runtime/client': [Repo.resolvePath('ts/7-runtime/runtime-src/client/Client.ts')],
        '@runtime/client/*': [Repo.resolvePath('ts/7-runtime/runtime-src/client/*')],
        '@tao/runtime-api': [Repo.resolvePath('ts/7-runtime/runtime-src/client/TaoRuntimeAPI.ts')],
        '@tao/ts-api': [Repo.resolvePath('ts/ts-api/ts-api-src/ts-api.ts')],
        '@shared': [Repo.resolvePath('ts/shared/shared-src/shared.ts')],
        '@shared/os/preview': [Repo.resolvePath('ts/shared/shared-src/os/preview/PreviewPlatform.ts')],
        'react': [Repo.resolvePath('ts/7-runtime/node_modules/@types/react')],
        'react/*': [Repo.resolvePath('ts/7-runtime/node_modules/@types/react/*')],
      },
    },
  })
}
