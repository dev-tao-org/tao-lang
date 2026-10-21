import { IO } from '@cli-kit'
import { Errors, Timings } from '@shared'
import { Platform } from '@shared/os'
import { parserFixtures } from './parser-fixtures'

const loadParserModule = Timings.measured('parser.module-load', () => import('../../1-grammar/grammar-src/parser'))

const main = Timings.topLevelTimer(async function(timings) {
  const { createParser } = await timings.run(loadParserModule)
  const parser = timings.run(createParser)
  const source = (await parserFixtures())[0]!.source
  const tree = timings.run(parser.parse, source)
  if (tree.rootNode.hasError || tree.rootNode.text !== source) {
    Errors.ThrowShouldNeverHappen('Cold parser sample did not parse the complete HelloWorld fixture.')
  }
  IO.print(JSON.stringify(timings.samples))
})

if (Platform.isMain(import.meta)) {
  await main()
}
