import type * as AST from '@ast-gen/AST'
import { Timings } from '@shared'
import { compileFile } from './FileCompiler'

/** compile emits a single Expo app module through typed Tao runtime APIs.
 *  Full compilation consumes one immutable AST; no previous result is reused. */
export function compile(
  document: AST.Document,
  options: { revision: string },
  timings = new Timings('compiler'),
): string {
  return Generate(timings, document, options)
}

const Generate = Timings.measure('compiler.generate', generate)

function generate(document: AST.Document, options: { revision: string }): string {
  return compileFile(document.root, options.revision)
}
