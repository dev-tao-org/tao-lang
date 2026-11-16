import { Objects, S } from '@shared'
import * as Shared from '@shared'
import type * as Typecheck from '@typecheck'
import { emitStringLiteral } from '../codegen-util'
import type { GeneratedModulePaths } from '../GeneratedPaths'
import { compileModuleInitialization } from '../ModuleInitialization'
import { projectTextViewParameterTypes } from './ForeignViewContractCompiler'
import { collectLibraryPublications, compilePublicationExportName, type PublishedView } from './LibraryPublications'
import { type CompiledFiles, compileModuleSources } from './ModulesCompiler'

/** CompiledLibrary holds shared generated sources and explicit public component subpaths. */
export type CompiledLibrary = { files: CompiledFiles; views: readonly PublishedView[] }

/** compileLibrary reuses compiled Tao module bodies with instance-owned ordered initialization. */
export function compileLibrary(
  program: Typecheck.LinkedProgram,
  ownSources: ReadonlySet<string>,
  target?: string,
): CompiledLibrary {
  const views = collectLibraryPublications(program, ownSources, target)
  const sources = compileModuleSources(program)
  const files = Objects.copy(sources.files)
  files['Library.ts'] = compileLibraryBootstrap(program, views, sources.paths)
  return { files, views }
}

function compileLibraryBootstrap(
  program: Typecheck.LinkedProgram,
  publications: readonly PublishedView[],
  paths: GeneratedModulePaths,
): string {
  const initialization = compileModuleInitialization(program, 'Library.ts', paths)
  const exports = publications.map(view => {
    const scope = initialization.scopes.get(view.source)!
    return `${emitStringLiteral(view.path)}: ${scope}[${emitStringLiteral(view.declaration.name.value)}]`
  })
  const components = publications.map((view, index) => compilePublicComponent(view, index))
  return S`
    import * as TR from '@runtime';
    import { createLibrary, createViewComponent } from '@tao/ts-api';
    import type { ViewProps } from '@tao/ts-api';
    ${initialization.imports}

    const library = createLibrary(() => {
      ${initialization.body}
      return { ${exports.join(', ')} };
    });
    ${Shared.joinTextLines(...components)}
    export default library;
  `
}

function compilePublicComponent(view: PublishedView, index: number): string {
  const types = projectTextViewParameterTypes(view.declaration)
  const props = Object.entries(types).map(([name, type]) => `${emitStringLiteral(name)}: ${type}`)
  const parameters = Object.keys(types).map(emitStringLiteral)
  const exportName = compilePublicationExportName(index)
  return `export const ${exportName} = createViewComponent<ViewProps & { ${props.join('; ')} }>(library, ${
    emitStringLiteral(view.path)
  }, [${parameters.join(', ')}]);`
}
