import { S } from '@shared'

import { emitJsonDocument } from '../codegen-util'
import { compileModuleImport } from '../GeneratedPaths'
import { LibraryScopePath } from './LibraryCompiler'
import { type PublishedDefinition, publishedDefinitionBinding } from './LibraryPublications'
import type { CompiledFiles } from './ModulesCompiler'

/** LibraryPackageConfiguration supplies the generated package name and installer-visible dependencies. */
export type LibraryPackageConfiguration = {
  name: string
  peerDependencies: LibraryDependencyVersions
  dependencies: LibraryDependencyVersions
}

/** compileLibraryPackageFiles emits source facades and a relocatable package manifest and TypeScript config. */
export function compileLibraryPackageFiles(
  publications: readonly PublishedDefinition[],
  configuration: LibraryPackageConfiguration,
): CompiledFiles {
  const files: LibraryPackageFiles = {}
  const exports: LibraryPackageExports = {}
  const paths: LibraryLocalPaths = {}
  const groups = groupPublishedDefinitions(publications)
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
export function collectLibraryPackageSpecifiers(publications: readonly PublishedDefinition[]): ReadonlySet<string> {
  return new Set(
    [...groupPublishedDefinitions(publications).keys()].filter(path => path !== '.').map(path => path.slice(2)),
  )
}

function groupPublishedDefinitions(publications: readonly PublishedDefinition[]): Map<string, PublishedDefinition[]> {
  const groups = new Map<string, PublishedDefinition[]>([['.', []]])
  for (const definition of publications) {
    const packageRoot = definition.subpath.split('/').slice(0, 2).join('/')
    if (!groups.has(packageRoot)) {
      groups.set(packageRoot, [])
    }
    const group = groups.get(definition.subpath)
    if (group) {
      group.push(definition)
    } else {
      groups.set(definition.subpath, [definition])
    }
  }
  return groups
}

function compileFacade(path: string, publications: readonly PublishedDefinition[]): string {
  const source = compileModuleImport(path, LibraryScopePath)
  if (publications.length === 0) {
    return S`
      import ${source};
      export {};
    `
  }
  const exports = publications.map(definition => `${publishedDefinitionBinding(definition)} as ${definition.name}`)
    .join(', ')
  return S`
    export { ${exports} } from ${source};
  `
}

function serializeLibraryPackage(configuration: LibraryPackageConfiguration, exports: LibraryPackageExports): string {
  return emitJsonDocument({
    name: configuration.name,
    version: '0.0.0',
    type: 'module',
    exports,
    peerDependencies: configuration.peerDependencies,
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
