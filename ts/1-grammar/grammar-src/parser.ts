import { type TimingEntry, Timings } from '@shared'
import { Platform, Repo } from '@shared/os'
import NativeParser from 'tree-sitter'

/** ParsedTree retains the native concrete syntax tree produced from one source snapshot. */
export type ParsedTree = NativeParser.Tree

/** Parser owns a timed parse boundary for complete Tao source snapshots. */
export type Parser = { parse: TimingEntry<[source: string], ParsedTree> }

/** createParser creates a session parsing complete source snapshots without reusing prior CSTs.
 *  Creation and each parse start fresh timing boundaries; timings.run can reuse an existing collector.
 *  Returned CSTs remain caller-owned and are reclaimed by the native binding's garbage collector. */
export const createParser = Timings.createTopLevelTimer(function(timings): Parser {
  const parser = timings.run(initializeParser)
  return {
    parse: Timings.createTopLevelTimer((context, source: string) => context.run(parseSource, parser, source)),
  }
})

const initializeParser = Timings.measure('parser.initialize', function(timings): NativeParser {
  const instance = new NativeParser()
  const language = timings.run(loadNativeLanguage)
  language.nodeTypeInfo = Platform.loadModule<NativeParser.NodeInfo[]>(
    Repo.resolvePath('ts/1-grammar/_gen_parser/src/node-types.json'),
  )
  instance.setLanguage(language)
  return instance
})

const parseSource = Timings.measured('parser.parse', (parser: NativeParser, source: string) => parser.parse(source))

const loadNativeLanguage = Timings.measured('parser.native-load', function(): NativeParser.Language {
  return Platform.loadModule<NativeParser.Language>(
    Repo.resolvePath('ts/1-grammar/_gen_parser/build/Release/tree_sitter_tao_binding.node'),
  )
})
