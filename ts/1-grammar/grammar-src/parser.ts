import { Timings } from '@shared'
import { Platform, Repo } from '@shared/os'
import Parser from 'tree-sitter'

/** createParser creates a session parsing complete source snapshots without reusing prior CSTs.
 *  Each parse returns its own timings by default; callers may supply their request's collector.
 *  Returned CSTs remain caller-owned and are reclaimed by the native binding's garbage collector. */
export function createParser(initialization = new Timings(`process:${Platform.pid}`)) {
  const parser = InitializeParser(initialization, initialization)
  return {
    initialization: initialization.samples,
    parse(source: string, timings = new Timings(`process:${Platform.pid}`)) {
      const tree = Parse(timings, parser, source)
      return { tree, timings: timings.samples }
    },
  }
}

const InitializeParser = Timings.measure('parser.initialize', initializeParser)
const LoadNativeLanguage = Timings.measure('parser.native-load', loadNativeLanguage)
const Parse = Timings.measure('parser.parse', parseSource)

function initializeParser(initialization: Timings): Parser {
  const instance = new Parser()
  const language = LoadNativeLanguage(initialization)
  language.nodeTypeInfo = Platform.loadModule<Parser.NodeInfo[]>(
    Repo.resolvePath('ts/1-grammar/_gen_parser/src/node-types.json'),
  )
  instance.setLanguage(language)
  return instance
}

function loadNativeLanguage(): Parser.Language {
  return Platform.loadModule<Parser.Language>(
    Repo.resolvePath('ts/1-grammar/_gen_parser/build/Release/tree_sitter_tao_binding.node'),
  )
}

function parseSource(parser: Parser, source: string): Parser.Tree {
  return parser.parse(source)
}
