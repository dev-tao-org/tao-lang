import { Timings } from '@shared'
import { Platform, Repo } from '@shared/os'
import Parser from './bridges/Bridge_tree-sitter'

/** createParser creates a session parsing complete source snapshots without reusing prior CSTs.
 *  Creation and each parse start fresh timing boundaries; timings.run can reuse an existing collector.
 *  Returned CSTs remain caller-owned and are reclaimed by the native binding's garbage collector. */
export const createParser = Timings.createTopLevelTimer(function(timings) {
  const parser = timings.run(initializeParser)
  return {
    parse: Timings.createTopLevelTimer((context, source: string) => context.run(parseSource, parser, source)),
  }
})

const initializeParser = Timings.measure('parser.initialize', function(timings): Parser {
  const instance = new Parser()
  const language = timings.run(loadNativeLanguage)
  language.nodeTypeInfo = Platform.loadModule<Parser.NodeInfo[]>(
    Repo.resolvePath('ts/1-grammar/_gen_parser/src/node-types.json'),
  )
  instance.setLanguage(language)
  return instance
})

const parseSource = Timings.measured('parser.parse', (parser: Parser, source: string) => parser.parse(source))

const loadNativeLanguage = Timings.measured('parser.native-load', function(): Parser.Language {
  return Platform.loadModule<Parser.Language>(
    Repo.resolvePath('ts/1-grammar/_gen_parser/build/Release/tree_sitter_tao_binding.node'),
  )
})
