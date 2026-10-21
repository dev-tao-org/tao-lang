import { Errors, Try } from '@shared'
import { Env, FileSystem, Path, Platform } from '@shared/os'

/** git captures Git output without a shell and keeps pathspecs literal. */
export async function git(root: string, args: string[], options: GitOptions = {}): Promise<string> {
  const child = Platform.spawn(['git', '--literal-pathspecs', ...args], {
    cwd: root,
    env: { ...Env.snapshot(), GIT_INDEX_FILE: options.index, GIT_TERMINAL_PROMPT: '0' },
    stdin: options.input === undefined ? 'ignore' : 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (options.input !== undefined && child.stdin) {
    child.stdin.write(options.input)
    child.stdin.end()
  }
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  if (status !== 0) {
    Errors.ThrowUserInput(`Git ${args[0]} failed: ${stderr.trim() || stdout.trim()}`)
  }
  return stdout
}

/** head returns the exact commit behind a branch or HEAD. */
export async function head(root: string, ref = 'HEAD'): Promise<string> {
  return (await git(root, ['rev-parse', '--verify', ref])).trim()
}

/** privateIndex creates a disposable index initialized from a tree. */
export async function privateIndex(root: string, directory: string, tree: string): Promise<string> {
  const index = Path.join(directory, `${Platform.randomUUID()}.index`)
  await git(root, ['read-tree', tree], { index })
  return index
}

/** tree returns an index's immutable tree object. */
export async function tree(root: string, index?: string): Promise<string> {
  return (await git(root, ['write-tree'], { index })).trim()
}

/** snapshot captures saved bytes, deletions, links and executable bits in a private index. */
export async function snapshot(root: string, directory: string, base: string, files?: string[]): Promise<string> {
  const index = await privateIndex(root, directory, base)
  const tracked = (await git(root, ['ls-tree', '-r', '--name-only', '-z', base])).split('\0').filter(Boolean)
  const candidates = files
    ?? [...tracked, ...(await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0')]
  const selected = candidates.filter(path =>
    path && !path.startsWith('.artifacts/') && (
      tracked.includes(path) || Try.WithDefault(false, () => Boolean(FileSystem.lstatSync(Path.join(root, path))))
    )
  )
  await assertSupportedTransforms(root, selected)
  if (selected.length) {
    await git(root, ['add', '-A', '--', ...new Set(selected)], { index })
  }
  return await tree(root, index)
}

/** indexPath locates this checkout's real Git index. */
export async function indexPath(root: string): Promise<string> {
  return (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).trim()
}

/** indexHash detects byte-level changes to a real or prepared index. */
export async function indexHash(path: string): Promise<string> {
  return Platform.hashBytes(await FileSystem.readFile(path), 'sha256')
}

/** expandFiles resolves literal selections, including tracked descendants deleted from disk. */
export async function expandFiles(root: string, inputs: string[], reviewed?: string | string[]): Promise<string[]> {
  if (!inputs.length) {
    Errors.ThrowUserInput('Select at least one literal file or folder.')
  }
  const selections = inputs.map(path => safePath(root, path))
  const output = await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...selections])
  let previous = ''
  for (const revision of typeof reviewed === 'string' ? [reviewed] : reviewed ?? []) {
    previous += await git(root, ['ls-tree', '-r', '--name-only', '-z', revision, '--', ...selections])
  }
  const files = [...new Set((output + previous).split('\0').filter(path => path && !path.startsWith('.artifacts/')))]
    .sort()
  if (!files.length) {
    Errors.ThrowUserInput('The literal selection contains no tracked or unignored files.')
  }
  for (const file of files) {
    safePath(root, file)
    assertNoParentLink(root, file)
  }
  return files
}

/** pathEntries returns exact mode/object entries, including absence, for selected paths. */
export async function pathEntries(root: string, revision: string, files: string[]): Promise<string> {
  return await git(root, ['ls-tree', '-z', revision, '--', ...files])
}

/** changedPaths returns literal paths changed between two immutable trees. */
export async function changedPaths(root: string, before: string, after: string): Promise<string[]> {
  return (await git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', before, after]))
    .split('\0').filter(Boolean)
}

/** applyPatch requires exact-context applicability before changing a private index. */
export async function applyPatch(root: string, index: string, patch: string, reverse = false): Promise<void> {
  const args = ['apply', '--cached', '--whitespace=nowarn', ...reverse ? ['--reverse'] : []]
  await git(root, [...args, '--check', '-'], { index, input: patch })
  await git(root, [...args, '-'], { index, input: patch })
}

/** diffPatch creates a binary-capable patch without rename inference. */
export async function diffPatch(root: string, before: string, after: string, files: string[]): Promise<string> {
  return await git(root, ['diff', '--binary', '--full-index', '--no-renames', before, after, '--', ...files])
}

/** assertSupportedTransforms rejects external filters and content encodings before Git reads working bytes. */
export async function assertSupportedTransforms(root: string, files: string[], index?: string): Promise<void> {
  if (!files.length) {
    return
  }
  const attributes = (await git(root, [
    'check-attr',
    '-z',
    ...index ? ['--cached'] : [],
    'filter',
    'working-tree-encoding',
    'ident',
    '--',
    ...files,
  ], { index })).split('\0')
  for (let offset = 0; offset + 2 < attributes.length; offset += 3) {
    const [path, attribute, value] = attributes.slice(offset, offset + 3)
    if (value !== 'unspecified' && value !== 'unset') {
      Errors.ThrowUserInput(
        `Unsupported Git content transform ${attribute}=${value} for ${path}. Disable that transform explicitly or defer this review selection.`,
      )
    }
  }
}

/** readJson reads retained workflow state without interpreting it as instructions. */
export async function readJson<Value>(path: string): Promise<Value> {
  return JSON.parse(await FileSystem.readFile(path, 'utf8')) as Value
}

/** writeJson atomically replaces retained state. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await FileSystem.writeFile(pending, JSON.stringify(value, null, 2) + '\n')
  await FileSystem.rename(pending, path)
}

type GitOptions = { index?: string; input?: string | Uint8Array }

function safePath(root: string, input: string): string {
  const absolute = Path.resolve(root, input)
  const path = Path.relative(root, absolute).replaceAll('\\', '/')
  if (!Path.isWithin(root, absolute) || path === '.git' || path.startsWith('.git/') || path.startsWith('.artifacts/')) {
    Errors.ThrowUserInput(`Selection must stay inside authored checkout paths: ${input}`)
  }
  return path || '.'
}

function assertNoParentLink(root: string, path: string): void {
  let directory = Path.dirname(Path.join(root, path))
  while (directory !== root) {
    const stat = Try.WithDefault(undefined, () => FileSystem.lstatSync(directory))
    if (stat?.isSymbolicLink()) {
      Errors.ThrowUserInput(`Selection traverses a symlink: ${path}`)
    }
    directory = Path.dirname(directory)
  }
}
