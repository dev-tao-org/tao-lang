import * as AST from '@ast-gen/AST'
import { Errors, Timings } from '@shared'
import { linkModules } from '@typecheck/LinkModules'
import type { LinkedProgram, SourceModule } from '@typecheck/Modules'
import { compileProgram, type ForeignViewPathResolver } from './ModulesCompiler'

/** CompileOptions supplies the revision, selected app and already resolved module inputs. */
export type CompileOptions = {
  revision: string
  app?: string
  program?: LinkedProgram
  foreignViewPath?: ForeignViewPathResolver
}

/** compile emits a single Expo app module through typed Tao runtime APIs.
 *  Full compilation consumes one immutable AST; no previous result is reused. */
export const compile = Timings.topLevelTimer(function(
  timings,
  document: AST.Document,
  options: CompileOptions,
): string {
  return timings.run(generate, document, options)
})

const generate = Timings.measured('compiler.generate', function(
  document: AST.Document,
  options: CompileOptions,
): string {
  const program = options.program ?? linkSingleFile(document)
  return compileProgram(program, options.revision, options.app, options.foreignViewPath)
})

function linkSingleFile(document: AST.Document): LinkedProgram {
  const hasImports = document.root.declarations.some(AST.IsImportStatement)
  if (hasImports) {
    Errors.ThrowUserInput('Compile a Tao file with use statements through its linked program.')
  }
  const path = '<memory>'
  const source: SourceModule = { path, document, imports: [], siblings: [] }
  return linkModules(path, [source])
}
