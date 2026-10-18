import { Timings } from '@shared'
import { Platform, Repo } from '@shared/os'
import Parser from 'tree-sitter'

/** createParser creates a session parsing complete source snapshots without reusing prior CSTs.
 *  Each parse returns its own timings by default; callers may supply their request's collector.
 *  Returned CSTs remain caller-owned and are reclaimed by the native binding's garbage collector. */
export function createParser(initialization = new Timings(`process:${Platform.pid}`)) {
  const initializeParser = initialization.measure('parser.initialize', function initializeParser() {
    const instance = new Parser()
    const loadNativeLanguage = initialization.measure('parser.native-load', function loadNativeLanguage() {
      return Platform.loadModule<Parser.Language>(
        Repo.resolvePath('ts/1-grammar/_gen_parser/build/Release/tree_sitter_tao_binding.node'),
      )
    })
    const language = loadNativeLanguage()
    language.nodeTypeInfo = Platform.loadModule<Parser.NodeInfo[]>(
      Repo.resolvePath('ts/1-grammar/_gen_parser/src/node-types.json'),
    )
    instance.setLanguage(language)
    return instance
  })
  const parser = initializeParser()
  return {
    initialization: initialization.samples,
    parse(source: string, timings = new Timings(`process:${Platform.pid}`)) {
      const parse = timings.measure('parser.parse', function parse(source: string) {
        return parser.parse(source)
      })
      const tree = parse(source)
      return { tree, timings: timings.samples }
    },
  }
}
