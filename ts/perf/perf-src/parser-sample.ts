import { IO } from '@cli-kit'
import { Errors, Timings } from '@shared'
import { Platform } from '@shared/os'
import { parserFixtures } from './parser-fixtures'

const LoadParserModule = Timings.measure('parser.module-load', loadParserModule)

if (Platform.isMain(import.meta)) {
  const timings = new Timings(`process:${Platform.pid}`)
  const { createParser } = await LoadParserModule(timings)
  const parser = createParser(timings)
  const source = (await parserFixtures())[0]!.source
  const { tree } = parser.parse(source, timings)
  if (tree.rootNode.hasError || tree.rootNode.text !== source) {
    Errors.ThrowUnexpected('Cold parser sample did not parse the complete HelloWorld fixture.')
  }
  IO.print(JSON.stringify(timings.samples))
}

function loadParserModule() {
  return import('../../1-grammar/grammar-src/parser')
}
