import { S } from '@shared'

import { emitJsonDocument } from '../codegen-util'
import { projectTextViewParameterTypes } from './ForeignViewContractCompiler'
import { compilePublicationExportName, type PublishedView } from './LibraryPublications'
import type { CompiledFiles } from './ModulesCompiler'

/** LibraryPackageConfiguration supplies the resolved package name and dependency versions. */
export type LibraryPackageConfiguration = {
  name: string
  peerDependencies: LibraryDependencyVersions
  dependencies: LibraryDependencyVersions
}

/** compileLibraryPackageFiles emits the public entry points, declarations and manifest for a bundled library. */
export function compileLibraryPackageFiles(
  views: readonly PublishedView[],
  configuration: LibraryPackageConfiguration,
): CompiledFiles {
  const exports: LibraryPackageExports = { '.': { types: './Library.d.ts', default: './Library.js' } }
  const files: LibraryPackageFiles = {
    'Library.js': "export { default } from './_Library.js';\n",
    'Library.d.ts': LibraryDeclaration,
  }
  for (const [index, view] of views.entries()) {
    const stem = `view${index}`
    const entry = `${stem}.js`
    const declaration = `${stem}.d.ts`
    exports[`./${view.path}`] = { types: `./${declaration}`, default: `./${entry}` }
    files[entry] = `export { ${compilePublicationExportName(index)} as default } from './_Library.js';\n`
    files[declaration] = compileViewDeclaration(view)
  }
  files['package.json'] = serializeLibraryPackage(configuration, exports)
  return files
}

type LibraryDependencyVersions = Readonly<Record<string, string>>
type LibraryPackageExports = Record<string, { types: string; default: string }>
type LibraryPackageFiles = Record<string, string>

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

function compileViewDeclaration(view: PublishedView): string {
  const parameters = projectTextViewParameterTypes(view.declaration)
  const props = Object.entries(parameters).map(([name, type]) => `${name}: ${type};`).join(' ')
  return S`
    import type * as React from 'react';
    export type Props = { ${props} children?: React.ReactNode };
    declare const View: React.ComponentType<Props>;
    export default View;
  `
}

const LibraryDeclaration = S`
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
