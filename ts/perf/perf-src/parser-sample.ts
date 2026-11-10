import { IO } from '@cli-kit'
import { Errors, Json, Timings, type TimingSample } from '@shared'
import { Platform } from '@shared/os'
import { parserFixtures } from './parser-fixtures'

const loadParserModule = Timings.measured('parser.module-load', async () => {
  const Grammar = await import('@grammar')
  return Grammar
})

const main = Timings.createTopLevelTimer(async function(timings) {
  const Grammar = await timings.run(loadParserModule)
  const parser = timings.run(Grammar.createParser)
  const source = (await parserFixtures())[0]!.source
  const tree = timings.run(parser.parse, source)
  if (tree.rootNode.hasError || tree.rootNode.text !== source) {
    Errors.ThrowShouldNeverHappen('Cold parser sample did not parse the complete performance fixture.')
  }
  IO.print(serializeParserTimingSamples(timings.samples))
})

function serializeParserTimingSamples(samples: readonly TimingSample[]): string {
  return Json.Print(samples)
}

if (Platform.isMain(import.meta)) {
  await main()
}
