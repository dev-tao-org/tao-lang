import * as AST from '@ast-gen/AST'
import { Errors, Timings, type TimingSample } from '@shared'
import { Platform, Tests } from '@shared/os'
import { createParser } from '../../1-grammar/grammar-src/parser'
import { transform } from '../../2-ast-gen/ast-gen-src/Transform'
import { compile } from '../../6-compile/compile-src/Compile'

/** transformerSamples measures full Hello World parsing, transformation and code generation.
 *  Record 100 warm samples after 20 warmups; no publication or preview is measured here. */
export async function transformerSamples(): Promise<(TimingSample & { scenario: string })[]> {
  const source = await Tests.readApp('Hello World')
  const parser = createParser()
  const samples: (TimingSample & { scenario: string })[] = []
  for (let index = 0; index < 120; index++) {
    const timings = new Timings(`process:${Platform.pid}`)
    const document = ParseTransformAndCompile(timings, source, parser, timings)
    const app = document?.root.declarations.find(AST.IsAppDeclaration)
    if (app?.name.value !== 'HelloWorld') {
      Errors.ThrowUnexpected('Hello World compiler sample did not produce the expected app.')
    }
    if (index >= 20) {
      samples.push(...timings.samples.map(sample => ({ ...sample, scenario: 'hello-world-compile' })))
    }
  }
  return samples
}

const ParseTransformAndCompile = Timings.measure('compiler.parse-to-code', parseTransformAndCompile)

function parseTransformAndCompile(
  source: string,
  parser: ReturnType<typeof createParser>,
  timings: Timings,
) {
  const { tree } = parser.parse(source, timings)
  const document = transform(tree, timings)
  if (document) {
    compile(document, { revision: 'benchmark' }, timings)
  }
  return document
}
