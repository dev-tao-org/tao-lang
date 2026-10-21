import * as AST from '@ast-gen/AST'
import { Errors, Timings } from '@shared'
import { linkModules } from '@typecheck/LinkModules'
import type { LinkedProgram, SourceModule } from '@typecheck/Modules'
import { compileProgram } from './ModulesCompiler'

/** compile emits a single Expo app module through typed Tao runtime APIs.
 *  Full compilation consumes one immutable AST; no previous result is reused. */
export function compile(
  document: AST.Document,
  options: {
    revision: string
    app?: string
    program?: LinkedProgram
    foreignViewPath?: (modulePath: string, authoredPath: string) => string
  },
  timings = new Timings(),
): string {
  return generate(timings, document, options)
}

const generate = Timings.measure('compiler.generate', function(
  document: AST.Document,
  options: {
    revision: string
    app?: string
    program?: LinkedProgram
    foreignViewPath?: (modulePath: string, authoredPath: string) => string
  },
): string {
  const program = options.program ?? linkSingleFile(document)
  return compileProgram(program, options.revision, options.app, options.foreignViewPath)
})

function linkSingleFile(document: AST.Document): LinkedProgram {
  if (
    document.root.declarations.some(declaration =>
      AST.IsUseStatement(declaration) || AST.IsUsePackageStatement(declaration)
    )
  ) {
    Errors.ThrowUserInput('Compile a Tao file with use statements through its linked program.')
  }
  const path = '<memory>'
  const source: SourceModule = { path, document, imports: [], siblings: [] }
  return linkModules(path, [source])
}
