import { runCommand } from '@cli-kit'
import { Timings } from '@shared'
import { Artifacts, BuildLock, Env, FileSystem, Path, Platform, Repo } from '@shared/os'
import { writeCSTTypes } from './cst-types'
import { nodeGypOptions } from './NodeGyp'

/** prepareParser builds when declared inputs change or required generated output disappears.
 *  This prepare operation owns _gen_parser; callers finish it before loading the native addon. */
export async function prepareParser(force = false, timings = new Timings()): Promise<void> {
  await BuildLock.withBuildLock(Artifacts.resolvePath('locks/parser.lock'), () => rebuildParser(force, timings))
}

const grammarRoot = Repo.resolvePath('ts/1-grammar/grammar-src')
const outputRoot = Repo.resolvePath('ts/1-grammar/_gen_parser')

async function rebuildParser(force: boolean, timings: Timings): Promise<void> {
  const inputs = await readInputs()
  const stamp = JSON.stringify(inputs)
  const outputs = [
    'src/parser.c',
    'src/grammar.json',
    'src/node-types.json',
    'src/tree_sitter/parser.h',
    'build/Release/tree_sitter_tao_binding.node',
  ]
  const stampPath = Path.join(outputRoot, 'inputs.json')
  const current = FileSystem.existsSync(stampPath) && await FileSystem.file(stampPath).text() === stamp
  if (canReuseParser(force, current, outputs)) {
    await writeCSTTypes(outputRoot)
    return
  }
  await FileSystem.mkdir(outputRoot, { recursive: true })
  await FileSystem.rm(stampPath, { force: true })
  for (const filename of ['binding.gyp', 'binding.cc']) {
    await FileSystem.write(Path.join(outputRoot, filename), inputs.sources[filename]!)
  }
  await generateParser(timings)
  await writeCSTTypes(outputRoot)
  await buildParserNative(timings, inputs)
  await FileSystem.write(stampPath, stamp)
  await writeBuildTimings(timings)
}

const generateParser = Timings.measure('parser.generate', async function(): Promise<void> {
  await runCommand('tree-sitter generate --abi 15 --output', {
    variadicArgs: [Path.join(outputRoot, 'src'), Path.join(grammarRoot, 'treesitter-grammar.js')],
    cwd: grammarRoot,
  })
})

const buildParserNative = Timings.measure('parser.native-build', async function(
  inputs: Awaited<ReturnType<typeof readInputs>>,
): Promise<void> {
  const options = nodeGypOptions(inputs.node.executable, Env.get('NODE_OPTIONS'))
  await runCommand('node-gyp rebuild --loglevel=warn --directory', {
    variadicArgs: [outputRoot, ...options.headers],
    cwd: Repo.resolvePath('ts'),
    env: options.environment,
  })
})

function canReuseParser(force: boolean, current: boolean, outputs: readonly string[]): boolean {
  return !force && current && outputs.every(path => FileSystem.existsSync(Path.join(outputRoot, path)))
}

async function readInputs() {
  const sources: Record<string, string> = {}
  for (const filename of ['treesitter-grammar.js', 'tree-sitter.json', 'binding.gyp', 'binding.cc']) {
    sources[filename] = await FileSystem.file(Path.join(grammarRoot, filename)).text()
  }
  return {
    sources,
    lock: Platform.hashText(await FileSystem.file(Repo.resolvePath('ts/bun.lock')).text()),
    system: Platform.systemInfo(),
    node: JSON.parse(
      await Platform.capture('node -p JSON.stringify({version:process.version,executable:process.execPath})'),
    ) as {
      version: string
      executable: string
    },
    environment: await environmentInputs(),
  }
}

async function environmentInputs(): Promise<string> {
  const paths = ['devenv.lock', 'devenv.nix', '.config/nix/toolchain-packages.nix']
  const sources = await Promise.all(paths.map(path => FileSystem.file(Repo.resolvePath(path)).text()))
  return Platform.hashText(sources.join('\n'))
}

async function writeBuildTimings(timings: Timings): Promise<void> {
  const directory = Artifacts.resolvePath('logs/performance')
  await Artifacts.mkdir(directory, { recursive: true })
  const path = Path.join(directory, `parser-build-${Platform.randomUUID()}.json`)
  Artifacts.trackTemporary(path)
  await Artifacts.write(path, JSON.stringify({ version: 1, samples: timings.samples }, null, 2))
}
