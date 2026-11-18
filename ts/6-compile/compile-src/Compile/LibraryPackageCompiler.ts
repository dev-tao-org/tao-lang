import { S } from '@shared'
import * as Shared from '@shared'

import { emitJsonDocument } from '../codegen-util'
import { compileModuleImport } from '../GeneratedPaths'
import { LibraryScopePath } from './LibraryCompiler'
import { type PublishedView, publishedViewBinding } from './LibraryPublications'
import type { CompiledFiles } from './ModulesCompiler'

/** LibraryPackageConfiguration supplies the generated package name and installer-visible dependencies. */
export type LibraryPackageConfiguration = {
  name: string
  peerDependencies: LibraryDependencyVersions
  hostProvidedPeers: readonly string[]
  dependencies: LibraryDependencyVersions
}

/** compileLibraryPackageFiles emits source facades and a relocatable package manifest and TypeScript config. */
export function compileLibraryPackageFiles(
  views: readonly PublishedView[],
  configuration: LibraryPackageConfiguration,
): CompiledFiles {
  const files: LibraryPackageFiles = {}
  const exports: LibraryPackageExports = {}
  const paths: LibraryLocalPaths = {}
  const groups = groupPublishedViews(views)
  for (const [subpath, selected] of groups) {
    const facade = subpath === '.' ? 'Library.ts' : `${subpath.slice(2)}.ts`
    const path = `ts/${facade}`
    files[path] = compileFacade(path, selected)
    exports[subpath] = `./${path}`
    if (subpath !== '.') {
      paths[subpath.slice(2)] = [`./${facade}`]
    }
  }
  files['package.json'] = serializeLibraryPackage(configuration, exports)
  files['ts/tsconfig.json'] = serializeLibraryTypeScript(paths)
  return files
}

type LibraryDependencyVersions = Readonly<Record<string, string>>
type LibraryPackageExports = Record<string, string>
type LibraryPackageFiles = Record<string, string>
type LibraryLocalPaths = Record<string, string[]>

/** collectLibraryPackageSpecifiers lists the exact local facade addresses emitted for publications. */
export function collectLibraryPackageSpecifiers(views: readonly PublishedView[]): ReadonlySet<string> {
  return new Set([...groupPublishedViews(views).keys()].filter(path => path !== '.').map(path => path.slice(2)))
}

function groupPublishedViews(views: readonly PublishedView[]): Map<string, PublishedView[]> {
  const groups = new Map<string, PublishedView[]>([['.', []]])
  for (const view of views) {
    const packageRoot = view.subpath.split('/').slice(0, 2).join('/')
    if (!groups.has(packageRoot)) {
      groups.set(packageRoot, [])
    }
    const group = groups.get(view.subpath)
    if (group) {
      group.push(view)
    } else {
      groups.set(view.subpath, [view])
    }
  }
  return groups
}

function compileFacade(path: string, views: readonly PublishedView[]): string {
  const source = compileModuleImport(path, LibraryScopePath)
  if (views.length === 0) {
    return S`
      import ${source};
      export {};
    `
  }
  const exports = views.map(view => `${publishedViewBinding(view)} as ${view.name},`)
  return S`
    export {
      ${Shared.joinTextLines(...exports)}
    } from ${source};
  `
}

function serializeLibraryPackage(configuration: LibraryPackageConfiguration, exports: LibraryPackageExports): string {
  const peerDependenciesMeta = Object.fromEntries(
    configuration.hostProvidedPeers.map(name => [name, { optional: true }]),
  )
  return emitJsonDocument({
    name: configuration.name,
    version: '0.0.0',
    type: 'module',
    exports,
    peerDependencies: configuration.peerDependencies,
    peerDependenciesMeta,
    dependencies: configuration.dependencies,
  })
}

function serializeLibraryTypeScript(paths: LibraryLocalPaths): string {
  return emitJsonDocument({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      allowImportingTsExtensions: true,
      esModuleInterop: true,
      jsx: 'react-jsx',
      preserveSymlinks: true,
      paths,
    },
    include: ['**/*.ts', '**/*.tsx'],
  })
}
