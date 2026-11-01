import * as AST from '@ast-gen/AST'
import { Errors, Timings, type TimingSample } from '@shared'

import type { Parser } from '@grammar/parser'
import { Repo, Tests } from '@shared/os'
import * as Stdlib from '@stdlib/Stdlib'
import { linkModules } from '@typecheck/LinkModules'
import { loadModules } from '@workspace/modules/Loader'
import { createParser } from '../../1-grammar/grammar-src/parser'
import { transform } from '../../2-ast-gen/ast-gen-src/Transform'
import { compile } from '../../6-compile/compile-src/Compile'

/** transformerSamples measures minimal benchmark parsing, transformation and code generation.
 *  Record 100 warm samples after 20 warmups; no publication or preview is measured here. */
export async function transformerSamples(): Promise<TransformerSample[]> {
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  const parser = createParser()
  const samples: TransformerSample[] = []
  for (let index = 0; index < 120; index++) {
    await sampleCompilation(source, parser, index, samples)
  }
  return samples
}

type TransformerSample = TimingSample & { scenario: string }

const sampleCompilation = Timings.createTopLevelTimer(
  async function(
    timings,
    source: string,
    parser: Parser,
    index: number,
    samples: TransformerSample[],
  ) {
    const document = await timings.run(parseTransformAndCompile, source, parser)
    const app = document && AST.FindAppDeclaration(document, 'Performance')
    if (app?.name.value !== 'Performance') {
      Errors.ThrowShouldNeverHappen('Preview performance compiler sample did not produce the expected app.')
    }
    if (index >= 20) {
      samples.push(...timings.samples.map(sample => ({ ...sample, scenario: 'preview-fixture-compile' })))
    }
  },
)

const parseTransformAndCompile = Timings.measure('compiler.parse-to-code', async function(
  timings,
  source: string,
  parser: Parser,
) {
  const tree = timings.run(parser.parse, source)
  const document = timings.run(transform, tree)
  if (document) {
    const path = Repo.resolvePath('ts/perf/perf-fixtures/Performance/Performance.tao')
    const sources = await timings.run(
      loadModules,
      { path, document },
      {
        resolveProject: async (_importer, alias) =>
          alias === 'tao' ? { root: await Stdlib.projectDirectory() } : undefined,
      },
      parser,
    )
    timings.run(compile, document, { revision: 'benchmark', program: linkModules(path, sources) })
  }
  return document
})
