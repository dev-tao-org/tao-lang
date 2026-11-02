import * as AST from '@ast-gen/AST'
import { Errors, Timings } from '@shared'
import { linkModules } from '@typecheck/LinkModules'
import type { LinkedProgram, SourceModule } from '@typecheck/Modules'
import * as ModulesCompiler from './ModulesCompiler'

/** CompileOptions supplies the revision, selected app and already resolved module inputs. */
export type CompileOptions = {
  revision: string
  app?: string
  program?: LinkedProgram
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

const generate = Timings.measured('compiler.generate', function(
  document: AST.Document,
  options: CompileOptions,
): ModulesCompiler.CompiledFiles {
  const program = options.program ?? linkSingleFile(document)
  return ModulesCompiler.compileProgram(program, options.revision, options.app, options.resolveForeignViewPath)
})

function linkSingleFile(document: AST.Document): LinkedProgram {
  const hasImports = AST.HasImportStatements(document)
  if (hasImports) {
    Errors.ThrowUserInput('Compile a Tao file with use statements through its linked program.')
  }
  const path = '<memory>'
  const source: SourceModule = { path, document, imports: [], siblings: [] }
  return linkModules(path, [source])
}
