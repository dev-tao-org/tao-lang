import { Errors, Timings, type TimingSample } from '@shared'
import { Platform, Tests } from '@shared/os'
import { createParser } from '../../1-grammar/grammar-src/parser'
import { transform } from '../../2-transform/transform-src/Transform'

/** transformerSamples measures the implemented app-only slice, excluding unsupported view declarations.
 *  Record 100 warm samples after 20 warmups; this is not a complete Hello World or preview measurement. */
export async function transformerSamples(): Promise<(TimingSample & { scenario: string })[]> {
  const source = (await Tests.readApp('Hello World')).split('\n\n')[0]!
  const parser = createParser()
  const samples: (TimingSample & { scenario: string })[] = []
  for (let index = 0; index < 120; index++) {
    const timings = new Timings(`process:${Platform.pid}`)
    const document = timings.measure('transformer.parse-to-ast', () => {
      const { tree } = parser.parse(source, timings)
      return transform(tree, timings)
    })
    if (document?.root.declarations[0]?.name.value !== 'HelloWorld') {
      Errors.ThrowUnexpected('App-only transformer sample did not produce the expected app.')
    }
    if (index >= 20) {
      samples.push(...timings.samples.map(sample => ({ ...sample, scenario: 'app-only' })))
    }
  }
  return samples
}
