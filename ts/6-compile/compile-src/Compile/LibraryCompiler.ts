import type * as AST from '@ast-gen'
import { S, Switch } from '@shared'
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

/** CompiledLibrary holds shared generated sources and explicit public declaration subpaths. */
export type CompiledLibrary = { files: CompiledFiles; publications: readonly LibraryPublications.PublishedDefinition[] }

/** compileLibrary reuses compiled Tao module bodies and initializes one scope per loaded library. */
export function compileLibrary(
  program: Typecheck.LinkedProgram,
  publications: readonly LibraryPublications.PublishedDefinition[],
  resolveForeignViewPath: ForeignViewPathResolver,
): CompiledLibrary {
  const sources = compileModuleSources(program, resolveForeignViewPath)
  const scope = compileLibraryBootstrap(program, publications, sources.paths)
  const files = { ...sources.files, [LibraryScopePath]: scope }
  return { files, publications }
}

function compileLibraryBootstrap(
  program: Typecheck.LinkedProgram,
  publications: readonly LibraryPublications.PublishedDefinition[],
  paths: GeneratedModulePaths,
): string {
  const initialization = compileModuleInitialization(program, LibraryScopePath, paths)
  const exports = publications.map(publication => {
    const scope = initialization.scopes.get(publication.source)!
    return compilePublicDefinition(publication, scope)
  })
  return S`
    ${emitGeneratedRuntimeImport()}
    ${initialization.imports}

    ${initialization.body}

    ${Shared.joinTextLines(...exports)}
  `
}

type Publication = LibraryPublications.PublishedDefinition

function compilePublicDefinition(publication: Publication, scope: string): string {
  const binding = LibraryPublications.publishedDefinitionBinding(publication)
  const declaration = `${scope}[${emitStringLiteral(publication.name)}]`
  return Switch.kind(publication.declaration, {
    ViewDeclaration: node => compilePublicComponent(node, binding, declaration),
    FunctionDeclaration: node => compilePublicFunction(node, binding, declaration),
  })
}

function compilePublicComponent(node: AST.ViewDeclaration, binding: string, declaration: string): string {
  const types = projectTextViewParameterTypes(node)
  const props = Object.entries(types).map(([name, type]) => `${emitStringLiteral(name)}: ${type}`)
  const parameters = Object.keys(types).map(emitStringLiteral)
  const propsType = props.length === 0 ? 'TR.LibraryViewProps' : `TR.LibraryViewProps & { ${props.join('; ')} }`
  return S`
    export function ${binding}(props: ${propsType}) {
       return TR.LibraryView(${declaration}, [${parameters.join(', ')}], props);
    }
  `
}

function compilePublicFunction(node: AST.FunctionDeclaration, binding: string, declaration: string): string {
  const fields = node.parameters.map(parameter => `readonly ${emitStringLiteral(parameter.name.value)}: string`)
  const argsType = fields.length === 0 ? 'Record<string, never>' : `{ ${fields.join('; ')} }`
  return S`
    export function ${binding}(args: ${argsType}): string {
       return TR.invokeTextFunction(${declaration}, args);
    }
  `
}
