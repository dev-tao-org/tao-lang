import { transform } from '@ast-gen/Transform'
import { compileLibrary } from '@compile/LibraryCompiler'
import type { PublishedView } from '@compile/LibraryPublications'
import { createParser } from '@grammar/parser'
import { Errors, S } from '@shared'
import { Artifacts, Bundle, FileSystem, Path, Platform, Repo } from '@shared/os'
import * as Stdlib from '@stdlib/Stdlib'
import { linkModules } from '@typecheck/LinkModules'
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
  const entry = FileSystem.realpathSync(Path.resolve(request.entry))
  const root = findNearestProjectRoot(Path.dirname(entry)) ?? Path.dirname(entry)
  const parser = createParser()
  const document = transform(parser.parse(await FileSystem.readFile(entry, 'utf8')))
  if (!document) {
    Errors.ThrowUserInput(`Invalid Tao library syntax: ${entry}.`)
  }
  const dependencies = new ProjectDependencies(root, await createProjectDependencyOptions(root))
  await dependencies.refresh()
  const modules = await loadModules({ path: entry, document }, {
    directory: root,
    resolveProject: async (importer, alias) =>
      alias === 'tao'
        ? { root: await Stdlib.projectDirectory() }
        : await dependencies.resolveProject(importer, alias),
  }, parser)
  const ownSources = new Set(modules.filter(module => isOwnProjectSource(root, module.path)).map(module => module.path))
  const library = compileLibrary(linkModules(entry, modules), ownSources, request.target)
  const sources = Artifacts.resolvePath('tmp', `library-sources-${Platform.randomUUID()}`)
  Artifacts.trackTemporary(sources)
  await writeGeneratedSources(sources, library.files)
  const configuration = Path.join(sources, 'tsconfig.json')
  await FileSystem.writeFile(configuration, serializeLibraryBuildConfiguration())
  const output = Path.resolve(request.out)
  await FileSystem.mkdir(output)
  await Bundle.bundleLibrary(Path.join(sources, 'Library.ts'), output, configuration)
  await writeLibraryPackage(output, request.name, library.views)
  return output
}

function requireLibraryPackageRequest(request: LibraryPackageRequest): void {
  if (!request.out || !request.name || !isNpmPackageName(request.name)) {
    Errors.ThrowUserInput('Library compilation requires an output directory and a valid package name.')
  }
  const output = Path.resolve(request.out)
  if (FileSystem.existsSync(Path.join(output, 'package.json'))) {
    Errors.ThrowUserInput(`Library output already contains a package: ${output}. Choose a fresh output directory.`)
  }
}

function isOwnProjectSource(root: string, source: string): boolean {
  const owner = findNearestProjectRoot(Path.dirname(source)) ?? root
  return Path.isWithin(root, source) && owner === root
}

async function writeGeneratedSources(directory: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [name, source] of Object.entries(files)) {
    const target = Path.join(directory, name)
    await FileSystem.mkdir(Path.dirname(target))
    await FileSystem.writeFile(target, source)
  }
}

function serializeLibraryBuildConfiguration(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        jsx: 'react-jsx',
        paths: {
          '@runtime': [Repo.resolvePath('ts/7-runtime/runtime-src/client/TR.ts')],
          '@runtime/client/*': [Repo.resolvePath('ts/7-runtime/runtime-src/client/*')],
          '@tao/runtime-api': [Repo.resolvePath('ts/7-runtime/runtime-src/client/TaoRuntimeAPI.ts')],
          '@tao/ts-api': [Repo.resolvePath('ts/ts-api/ts-api-src/ts-api.ts')],
          '@shared': [Repo.resolvePath('ts/shared/shared-src/shared.ts')],
          '@shared/os/preview': [Repo.resolvePath('ts/shared/shared-src/os/preview/PreviewPlatform.ts')],
        },
      },
    },
    null,
    2,
  )
}

async function writeLibraryPackage(output: string, name: string, views: readonly PublishedView[]): Promise<void> {
  const exports: LibraryPackageExports = { '.': { types: './Library.d.ts', default: './Library.js' } }
  await FileSystem.writeFile(Path.join(output, 'Library.js'), "export { default } from './_Library.js';\n")
  await FileSystem.writeFile(Path.join(output, 'Library.d.ts'), libraryDeclaration)
  for (const [index, view] of views.entries()) {
    const stem = `view${index}`
    exports[`./${view.path}`] = { types: `./${stem}.d.ts`, default: `./${stem}.js` }
    await FileSystem.writeFile(
      Path.join(output, `${stem}.js`),
      `export { Published${index} as default } from './_Library.js';\n`,
    )
    await FileSystem.writeFile(Path.join(output, `${stem}.d.ts`), compileViewDeclaration(view))
  }
  await FileSystem.writeFile(Path.join(output, 'package.json'), serializeLibraryPackage(name, exports))
}

type LibraryPackageExports = Record<string, { types: string; default: string }>

function serializeLibraryPackage(name: string, exports: LibraryPackageExports): string {
  return JSON.stringify(
    {
      name,
      version: '0.0.0',
      type: 'module',
      exports,
      peerDependencies: { 'react': '19.2.3', 'react-native': '0.86.3' },
      dependencies: { '@preact/signals-core': '1.14.4' },
    },
    null,
    2,
  )
}

function compileViewDeclaration(view: PublishedView): string {
  const props = view.declaration.parameters.map(parameter => `${parameter.name.value}: string;`).join(' ')
  return S`
    import type * as React from 'react';
    export type Props = { ${props} children?: React.ReactNode };
    declare const View: React.ComponentType<Props>;
    export default View;
  `
}

const libraryDeclaration = S`
  import type * as React from 'react';
  declare const instanceOwner: unique symbol;
  export type Instance = {
    readonly [instanceOwner]: true;
    readonly disposed: boolean;
    dispose(): void;
  };
  declare const library: {
    instantiate(): Instance;
    Provider: React.ComponentType<{ instance: Instance; children?: React.ReactNode }>;
  };
  export default library;
`
