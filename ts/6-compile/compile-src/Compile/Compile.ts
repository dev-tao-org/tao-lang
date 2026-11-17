import * as AST from '@ast-gen'
import { Timings, UserInput } from '@shared'
import * as SourceValidation from '@source-validation'
import * as Typecheck from '@typecheck'

import * as ModulesCompiler from './ModulesCompiler'

/** CompileOptions supplies the revision, selected app and already resolved module inputs. */
export type CompileOptions = {
  revision: string
  app?: string
  program?: Typecheck.LinkedProgram
  resolveForeignViewPath?: ModulesCompiler.ForeignViewPathResolver
}

/** compile emits a complete source-owned Expo module graph through typed Tao runtime APIs.
 *  Full compilation consumes one immutable AST; no previous result is reused. */
export const compile = Timings.createTopLevelTimer(function(
  timings,
  document: AST.Document,
  options: CompileOptions,
): ModulesCompiler.CompiledFiles {
  return timings.run(generate, document, options)
})

const generate = Timings.measure('compiler.generate', function(
  timings,
  document: AST.Document,
  options: CompileOptions,
): ModulesCompiler.CompiledFiles {
  const program = options.program ?? linkSingleFile(document)
  return timings.run(
    ModulesCompiler.compileProgram,
    program,
    options.revision,
    options.app,
    options.resolveForeignViewPath,
  )
})

function linkSingleFile(document: AST.Document): Typecheck.LinkedProgram {
  const hasImports = AST.HasImportStatements(document)
  UserInput.Require(!hasImports, 'Compile a Tao file with use statements through its linked program.')
  const path = '<memory>'
  SourceValidation.assertValidStatements(document, path)
  const source: Typecheck.SourceModule = { path, document, imports: [], siblings: [] }
  return Typecheck.linkModules(path, [source])
}
