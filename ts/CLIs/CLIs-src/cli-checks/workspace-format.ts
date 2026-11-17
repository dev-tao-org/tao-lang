import * as CLIKit from '@cli-kit'
import { NewlineCharacter, Regxs, UserInput } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { assertNewWorkspaceTree } from './check'
import { assertParserOutputTrees } from './parser-build'

type FormatMode = 'fmt' | 'check'
type WorkspaceFormatOptions = { paths?: readonly string[]; excludedPaths?: readonly string[] }

/** workspaceFormat formats or checks the selected files in the new repository. */
export async function workspaceFormat(
  mode: FormatMode,
  root: string,
  { paths = [], excludedPaths = [] }: WorkspaceFormatOptions = {},
): Promise<void> {
  if (paths.length === 0) {
    const justfile = Path.join(root, JustfileName)
    const excludesJustfile = excludedPaths.some(path => Path.resolve(root, path) === justfile)
    if (!excludesJustfile) {
      Repo.assertNewWorkspacePath(justfile, root)
    }
    await formatDprintSelection(mode, root, AllWorkspaceFiles, excludedPaths)
    if (!excludesJustfile) {
      await formatJustfile(mode, root, JustfileName)
    }
    return
  }
  for (const path of paths) {
    await formatRequestedTarget(mode, root, path)
  }
}

const JustfileName = 'Justfile'
const AllWorkspaceFiles = '**/*'
const DprintConfig = '.dprint.jsonc'
const DprintLiteralGlobCharacters = new Map([
  ['*', '[*]'],
  ['?', '[?]'],
  ['[', '[[]'],
  [']', '[]]'],
  ['{', '[{]'],
  ['}', '[}]'],
])

async function formatRequestedTarget(mode: FormatMode, root: string, path: string): Promise<void> {
  const absolute = Path.resolve(root, path)
  Repo.assertNewWorkspacePath(absolute, root)
  if (!FS.existsSync(absolute) || !FS.statSync(absolute).isFile()) {
    if (!Regxs.CliGlobTokenRegx.test(path)) {
      UserInput.fail(`Formatting requires a file or glob: ${path}`)
    }
    await formatDprintSelection(mode, root, path)
    return
  }
  if (absolute.endsWith('.tao')) {
    await assertNewWorkspaceTree(root)
    await assertParserOutputTrees(root)
    const { updateTaoSource } = await import('../dev-cli/source/TaoSource')
    await updateTaoSource(absolute, 'format')
  } else if (Path.basename(absolute) === JustfileName) {
    await formatJustfile(mode, root, absolute)
  } else {
    const pattern = encodeDprintPath(Path.relative(root, absolute))
    await formatDprintSelection(mode, root, pattern, [], absolute)
  }
}

function encodeDprintPath(path: string): string {
  const segments = path.split(Path.sep)
  const escaped = segments.map(segment => {
    const literal = Array.from(segment, character => DprintLiteralGlobCharacters.get(character) ?? character).join('')
    // dprint's traversal recognizes braces as a pattern even when the only escapes are bracket classes.
    const alternative = literal.replaceAll(',', '[,]')
    return literal === segment ? segment : `{${alternative},${alternative}}`
  })
  return `./${escaped.join('/')}`
}

async function formatDprintSelection(
  mode: FormatMode,
  root: string,
  pattern: string,
  excludedPaths: readonly string[] = [],
  exactPath?: string,
): Promise<void> {
  const selection = buildDprintSelection(pattern, excludedPaths)
  const paths = await Exec.captureStdout('dprint', ['output-file-paths', ...selection], { cwd: root, trim: false })
  assertDprintSelection(root, paths, exactPath)
  // Replay the same selection to retain dprint's config, matching and gitignore rules.
  await CLIKit.runNonInteractiveCommand('dprint', [mode, '--incremental=false', ...selection], { cwd: root })
}

function buildDprintSelection(pattern: string, excludedPaths: readonly string[]): string[] {
  const excludes = excludedPaths.length > 0 ? ['--excludes', ...excludedPaths] : []
  return ['--config', DprintConfig, ...excludes, '--', pattern]
}

function assertDprintSelection(root: string, output: string, exactPath?: string): void {
  if (!output) {
    return
  }
  const canonicalRoot = FS.realpathSync(root)
  const canonicalExactPath = exactPath === undefined ? undefined : FS.realpathSync(exactPath)
  const paths = output.endsWith(NewlineCharacter) ? output.slice(0, -1) : output
  for (const path of paths.split(NewlineCharacter)) {
    if (!Path.isAbsolute(path) || !Path.isWithin(canonicalRoot, path)) {
      UserInput.fail(`dprint reported a path outside ${root}: ${path}`)
    }
    const selectedPath = Path.resolve(root, Path.relative(canonicalRoot, path))
    Repo.assertNewWorkspacePath(selectedPath, root)
    if (canonicalExactPath !== undefined && FS.realpathSync(selectedPath) !== canonicalExactPath) {
      UserInput.fail(`dprint selected another file for ${exactPath}: ${selectedPath}`)
    }
  }
}

async function formatJustfile(mode: FormatMode, root: string, path: string): Promise<void> {
  const check = mode === 'check' ? ['--check'] : []
  await CLIKit.runNonInteractiveCommand('just', ['--fmt', ...check, '--justfile', path], { cwd: root })
}
