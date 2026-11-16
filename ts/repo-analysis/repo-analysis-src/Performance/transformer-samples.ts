import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { Errors, Timings, type TimingSample } from '@shared'
import * as Stdlib from '@stdlib'
import * as Typecheck from '@typecheck'
import * as Workspace from '@workspace'

import { Repo } from '@shared/os'

import * as Compile from '@compile'
import { PerformanceFixturePath, readPerformanceFixture } from './parser-fixtures'

/** transformerSamples measures minimal benchmark parsing, transformation and code generation.
 *  Record 100 warm samples after 20 warmups; no publication or preview is measured here. */
export async function transformerSamples(): Promise<TransformerSample[]> {
  const source = await readPerformanceFixture()
  const parser = Grammar.createParser()
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
    parser: Grammar.Parser,
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
  parser: Grammar.Parser,
) {
  const tree = timings.run(parser.parse, source)
  const document = timings.run(AST.transform, tree)
  if (document) {
    const path = Repo.resolvePath(PerformanceFixturePath)
    const sources = await timings.run(
      Workspace.loadModules,
      { path, document },
      {
        resolveProject: async (_importer, alias) =>
          alias === 'tao' ? { root: await Stdlib.projectDirectory() } : undefined,
      },
      parser,
    )
    timings.run(Compile.compile, document, { revision: 'benchmark', program: Typecheck.linkModules(path, sources) })
  }
  return document
})
