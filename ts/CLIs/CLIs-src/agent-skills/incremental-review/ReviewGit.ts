import { Json, Lists, NewlineCharacter, NullCharacter, Sort, Try, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'

type GitOptions = { index?: string; input?: GitInput }
/** git captures Git output without a shell and keeps pathspecs literal. */
export async function git(root: string, args: string[], options: GitOptions = {}): Promise<string> {
  const addEnv = { GIT_INDEX_FILE: options.index, GIT_TERMINAL_PROMPT: '0' }
  const result = await Exec.capture('git', ['--literal-pathspecs', ...args], {
    check: false,
    cwd: root,
    addEnv,
    stdin: options.input,
  })
  if (result.status !== 0 || result.signal !== null) {
    UserInput.Fail(`Git ${args[0]} failed: ${result.stderr.trim() || result.stdout.trim()}`)
  }
  return result.stdout
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
  const tracked = (await git(root, ['ls-tree', '-r', '--name-only', '-z', base])).split(NullCharacter).filter(Boolean)
  let candidates: string[]
  if (files !== undefined) {
    candidates = files
  } else {
    candidates = [
      ...tracked,
      ...(await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split(NullCharacter),
    ]
  }
  const selected = candidates.filter(path => isSnapshotCandidate(root, tracked, path))
  await assertSupportedTransforms(root, selected)
  if (selected.length) {
    await git(root, ['add', '-A', '--', ...Lists.unique(selected)], { index })
  }
  return await tree(root, index)
}

function isSnapshotCandidate(root: string, tracked: string[], path: string): boolean {
  if (!path || path.startsWith('.artifacts/')) {
    return false
  }
  if (tracked.includes(path)) {
    return true
  }
  return Try.WithDefault(false, () => Boolean(FS.lstatSync(Path.join(root, path))))
}

/** resolveGitIndexPath locates this checkout's real Git index. */
export async function resolveGitIndexPath(root: string): Promise<string> {
  return (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).trim()
}

/** indexHash detects byte-level changes to a real or prepared index. */
export async function indexHash(path: string): Promise<string> {
  return Platform.hashBytes(await FS.readFile(path), 'sha256')
}

type ReviewedRevisions = string | string[]
/** expandFiles resolves literal selections, including tracked descendants deleted from disk. */
export async function expandFiles(root: string, inputs: string[], reviewed?: ReviewedRevisions): Promise<string[]> {
  UserInput.Require(!!inputs.length, 'Select at least one literal file or folder.')
  const selections = inputs.map(path => safePath(root, path))
  const output = await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...selections])
  let previous = ''
  for (const revision of typeof reviewed === 'string' ? [reviewed] : reviewed ?? []) {
    previous += await git(root, ['ls-tree', '-r', '--name-only', '-z', revision, '--', ...selections])
  }
  const files = [
    ...Lists.unique((output + previous).split(NullCharacter).filter(path => path && !path.startsWith('.artifacts/'))),
  ]
    .sort(Sort.CompareStrings)
  UserInput.Require(!!files.length, 'The literal selection contains no tracked or unignored files.')
  for (const file of files) {
    safePath(root, file)
    assertNoParentLink(root, file)
  }
  return files
}

/** readGitPathEntries returns exact mode/object entries, including absence, for selected paths. */
export async function readGitPathEntries(root: string, revision: string, files: string[]): Promise<string> {
  return await git(root, ['ls-tree', '-z', revision, '--', ...files])
}

/** changedPaths returns literal paths changed between two immutable trees. */
export async function changedPaths(root: string, before: string, after: string): Promise<string[]> {
  return (await git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', before, after]))
    .split(NullCharacter).filter(Boolean)
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
  ], { index })).split(NullCharacter)
  for (let offset = 0; offset + 2 < attributes.length; offset += 3) {
    const [path, attribute, value] = attributes.slice(offset, offset + 3)
    if (value !== 'unspecified' && value !== 'unset') {
      UserInput.Fail(
        `Unsupported Git content transform ${attribute}=${value} for ${path}. Disable that transform explicitly or defer this review selection.`,
      )
    }
  }
}

/** readJson reads retained workflow state without interpreting it as instructions. */
export async function readJson<Value>(path: string): Promise<Value> {
  return Json.Parse(await FS.readFile(path, 'utf8')) as Value
}

/** writeJson atomically replaces retained state. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await FS.writeFile(pending, Json.Print(value) + NewlineCharacter)
  await FS.rename(pending, path)
}

type GitInput = string | Uint8Array

function safePath(root: string, input: string): string {
  const absolute = Path.resolve(root, input)
  const path = Path.relative(root, absolute).replaceAll('\\', '/')
  const isGitMetadata = path === '.git' || path.startsWith('.git/')
  const isArtifact = path.startsWith('.artifacts/')
  if (!Path.isWithin(root, absolute) || isGitMetadata || isArtifact) {
    UserInput.Fail(`Selection must stay inside authored checkout paths: ${input}`)
  }
  return path || '.'
}

function assertNoParentLink(root: string, path: string): void {
  let directory = Path.dirname(Path.join(root, path))
  while (directory !== root) {
    const stat = Try.WithDefault(undefined, () => FS.lstatSync(directory))
    if (stat?.isSymbolicLink()) {
      UserInput.Fail(`Selection traverses a symlink: ${path}`)
    }
    directory = Path.dirname(directory)
  }
}
