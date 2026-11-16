import * as CLIKit from '@cli-kit'
import { Json } from '@shared'
import { NewlineCharacter, Timings } from '@shared'
import { Artifacts, BuildLock, Env, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { nodeMetadataProbe } from '../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node-emission'
import { writeCSTTypes } from './cst-types'
import { nodeGypOptions } from './NodeGyp'
import { writeSemanticAst } from './semantic-ast'

/** prepareParser builds when declared inputs change or required generated output disappears.
 *  This prepare operation owns _gen_parser; callers finish it before loading the native addon. */
export const prepareParser = Timings.createTopLevelTimer(
  async function(timings, force: boolean = false): Promise<void> {
    await BuildLock.withBuildLock(Artifacts.resolvePath('locks/parser.lock'), () => rebuildParser(force, timings))
  },
)

const grammarRoot = Repo.resolvePath('ts/1-grammar/grammar-src')
const outputRoot = Repo.resolvePath('ts/1-grammar/_gen_parser')

type ParserSourceContents = Record<string, string>
type ParserNodeMetadata = { version: string; executable: string }
type ParserBuildInputs = {
  sources: ParserSourceContents
  lock: string
  system: Platform.SystemInformation
  node: ParserNodeMetadata
  environment: string
}

async function rebuildParser(force: boolean, timings: Timings): Promise<void> {
  const inputs = await readInputs()
  const stamp = encodeParserBuildInputs(inputs)
  const outputs = [
    'src/parser.c',
    'src/grammar.json',
    'src/node-types.json',
    'src/tree_sitter/parser.h',
    'build/Release/tree_sitter_tao_binding.node',
  ]
  const stampPath = Path.join(outputRoot, 'inputs.json')
  const current = FS.existsSync(stampPath) && await FS.file(stampPath).text() === stamp
  if (canReuseParser(force, current, outputs)) {
    await writeCSTTypes(outputRoot)
    await writeSemanticAst(outputRoot)
    return
  }
  await FS.mkdir(outputRoot)
  await FS.rm(stampPath, { force: true })
  for (const filename of ['binding.gyp', 'binding.cc']) {
    await FS.write(Path.join(outputRoot, filename), inputs.sources[filename]!)
  }
  await timings.run(generateParser)
  await writeCSTTypes(outputRoot)
  await writeSemanticAst(outputRoot)
  await timings.run(buildParserNative, inputs)
  await FS.write(stampPath, stamp)
  await writeBuildTimings(timings)
}

const generateParser = Timings.measured('parser.generate', async function(): Promise<void> {
  await CLIKit.runNonInteractiveCommand(
    'tree-sitter',
    [
      'generate',
      '--abi',
      '15',
      '--output',
      Path.join(outputRoot, 'src'),
      Path.join(grammarRoot, 'treesitter-grammar.js'),
    ],
    { cwd: grammarRoot },
  )
})

const buildParserNative = Timings.measured('parser.native-build', async function(
  inputs: ParserBuildInputs,
): Promise<void> {
  const options = nodeGypOptions(inputs.node.executable, Env.get('NODE_OPTIONS'))
  await CLIKit.runNonInteractiveCommand('node-gyp', [
    'rebuild',
    '--loglevel=warn',
    '--directory',
    outputRoot,
    ...options.headers,
  ], {
    cwd: Repo.resolvePath('ts'),
    addEnv: options.environment,
  })
})

function canReuseParser(force: boolean, current: boolean, outputs: readonly string[]): boolean {
  return !force && current && outputs.every(path => FS.existsSync(Path.join(outputRoot, path)))
}

async function readInputs(): Promise<ParserBuildInputs> {
  const sources: ParserSourceContents = {}
  for (
    const filename of [
      'treesitter-grammar.js',
      'semantic-ast-metadata.json',
      'tree-sitter.json',
      'binding.gyp',
      'binding.cc',
    ]
  ) {
    sources[filename] = await FS.file(Path.join(grammarRoot, filename)).text()
  }
  return {
    sources,
    lock: Platform.hashText(await FS.file(Repo.resolvePath('ts/bun.lock')).text()),
    system: Platform.systemInfo(),
    node: parseParserNodeMetadata(await Exec.captureStdout('node', ['-p', nodeMetadataProbe])),
    environment: await collectEnvironmentInputs(),
  }
}

async function collectEnvironmentInputs(): Promise<string> {
  const paths = ['devenv.lock', 'devenv.nix', '.config/nix/toolchain-packages.nix']
  const sources = await Promise.all(paths.map(path => FS.file(Repo.resolvePath(path)).text()))
  return Platform.hashText(sources.join(NewlineCharacter))
}

function encodeParserBuildInputs(inputs: ParserBuildInputs): string {
  return Json.Print(inputs)
}

function parseParserNodeMetadata(contents: string): ParserNodeMetadata {
  return Json.Parse(contents) as ParserNodeMetadata
}

async function writeBuildTimings(timings: Timings): Promise<void> {
  const directory = Artifacts.resolvePath('logs/performance')
  await Artifacts.mkdir(directory)
  const path = Path.join(directory, `parser-build-${Platform.randomUUID()}.json`)
  Artifacts.trackTemporary(path)
  await Artifacts.write(path, formatParserBuildTimings(timings))
}

function formatParserBuildTimings(timings: Timings): string {
  return Json.Print({ version: 1, samples: timings.samples })
}
