import { S } from '@shared'
import type { LinkedProgram } from '@typecheck/Modules'
import { emitStringLiteral } from './codegen-util'
import type { GeneratedModulePaths } from './GeneratedPaths'
import { collectLibraryPublications, type PublishedView } from './LibraryPublications'
import { compileModuleInitialization } from './ModuleInitialization'
import { type CompiledFiles, compileModuleSources } from './ModulesCompiler'

/** CompiledLibrary holds shared generated sources and explicit public component subpaths. */
export type CompiledLibrary = { files: CompiledFiles; views: readonly PublishedView[] }

/** compileLibrary reuses compiled Tao module bodies with instance-owned ordered initialization. */
export function compileLibrary(
  program: LinkedProgram,
  ownSources: ReadonlySet<string>,
  target?: string,
): CompiledLibrary {
  const views = collectLibraryPublications(program, ownSources, target)
  const sources = compileModuleSources(program)
  const files = { ...sources.files }
  files['Library.ts'] = compileLibraryBootstrap(program, views, sources.paths)
  return { files, views }
}

function compileLibraryBootstrap(
  program: LinkedProgram,
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
    ${components.join('\n')}
    export default library;
  `
}

function compilePublicComponent(view: PublishedView, index: number): string {
  const props = view.declaration.parameters.map(parameter => `${emitStringLiteral(parameter.name.value)}: string`)
  const parameters = view.declaration.parameters.map(parameter => emitStringLiteral(parameter.name.value))
  return `export const Published${index} = createViewComponent<ViewProps & { ${props.join('; ')} }>(library, ${
    emitStringLiteral(view.path)
  }, [${parameters.join(', ')}]);`
}
