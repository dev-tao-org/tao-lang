import { S } from '@shared'
import * as Shared from '@shared'
import type * as Typecheck from '@typecheck'
import { emitStringLiteral } from '../codegen-util'
import type { GeneratedModulePaths } from '../GeneratedPaths'
import { compileModuleInitialization } from '../ModuleInitialization'
import { emitGeneratedRuntimeImport } from '../RuntimeEmitter'
import { projectTextViewParameterTypes } from './ForeignViewContractCompiler'
import * as LibraryPublications from './LibraryPublications'
import { type CompiledFiles, compileModuleSources, type ForeignViewPathResolver } from './ModulesCompiler'

/** LibraryScopePath is the shared private bootstrap used by every public library facade. */
export const LibraryScopePath = 'ts/LibraryScope.ts'

/** LibraryAssetTypesPath names the ambient asset types reachable from every public library entry. */
export const LibraryAssetTypesPath = 'ts/tao-assets.d.ts'

/** CompiledLibrary holds shared generated sources and explicit public component subpaths. */
export type CompiledLibrary = { files: CompiledFiles; views: readonly LibraryPublications.PublishedView[] }

/** compileLibrary reuses compiled Tao module bodies and initializes one scope per loaded library. */
export function compileLibrary(
  program: Typecheck.LinkedProgram,
  views: readonly LibraryPublications.PublishedView[],
  resolveForeignViewPath: ForeignViewPathResolver,
): CompiledLibrary {
  const sources = compileModuleSources(program, resolveForeignViewPath)
  const scope = compileLibraryBootstrap(program, views, sources.paths)
  const files = { ...sources.files, [LibraryScopePath]: scope }
  return { files, views }
}

function compileLibraryBootstrap(
  program: Typecheck.LinkedProgram,
  publications: readonly LibraryPublications.PublishedView[],
  paths: GeneratedModulePaths,
): string {
  const initialization = compileModuleInitialization(program, LibraryScopePath, paths)
  const components = publications.map(view => {
    const scope = initialization.scopes.get(view.source)!
    return compilePublicComponent(view, scope)
  })
  return S`
    /// <reference path="./tao-assets.d.ts" />
    ${emitGeneratedRuntimeImport()}
    ${initialization.imports}

    ${initialization.body}

    ${Shared.joinTextLines(...components)}
  `
}

function compilePublicComponent(view: LibraryPublications.PublishedView, scope: string): string {
  const types = projectTextViewParameterTypes(view.declaration)
  const props = Object.entries(types).map(([name, type]) => `${emitStringLiteral(name)}: ${type}`)
  const parameters = Object.keys(types).map(emitStringLiteral)
  const binding = LibraryPublications.publishedViewBinding(view)
  const declaration = `${scope}[${emitStringLiteral(view.name)}]`
  const propsType = props.length === 0 ? 'TR.LibraryViewProps' : `TR.LibraryViewProps & { ${props.join('; ')} }`
  return S`
    export function ${binding}(props: ${propsType}) {
       return TR.LibraryView(${declaration}, [${parameters.join(', ')}], props);
    }
  `
}
