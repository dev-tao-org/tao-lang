import { NewlineCharacter, NullCharacter, Try, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { captureGit } from './Git'

/** TreeEntry retains Git's source type, content identity and literal path. */
export type TreeEntry = { mode: string; hash: string; path: string }

/** readTreeEntries reads literal paths including whitespace without Git's display quoting. */
export async function readTreeEntries(root: string, tree: string, env?: Record<string, string>): Promise<TreeEntry[]> {
  const output = await captureGit(root, ['ls-tree', '-rz', tree], { env })
  return parseTreeEntries(output)
}

/** parseTreeEntries reads NUL-separated Git tree entries from a local or remote checkout. */
export function parseTreeEntries(output: string): TreeEntry[] {
  return output.split(NullCharacter).filter(Boolean).map(entry => {
    const separator = entry.indexOf('\t')
    const [mode, , hash] = entry.slice(0, separator).split(' ')
    return { mode, hash, path: entry.slice(separator + 1) }
  })
}

/** isRegularTreeFile checks whether a recursive Git tree entry represents a regular file. */
export function isRegularTreeFile(entry: TreeEntry): boolean {
  return entry.mode === RegularFileMode || entry.mode === ExecutableMode
}

/** assertNoContentTransforms rejects attributes that can change saved or materialized source bytes. */
export async function assertNoContentTransforms(root: string, files: string[], cached = false): Promise<void> {
  const args = ['check-attr', '-z', '--stdin', 'filter', 'working-tree-encoding', 'ident', 'text', 'eol']
  if (cached) {
    args.splice(1, 0, '--cached')
  }
  const input = files.join(NullCharacter) + NullCharacter
  const attributes = (await captureGit(root, args, { input })).split(NullCharacter)
  for (let offset = 0; offset + 2 < attributes.length; offset += 3) {
    const [path, attribute, value] = attributes.slice(offset, offset + 3)
    if (value !== 'unspecified' && value !== 'unset') {
      UserInput.fail(`Snapshot cannot preserve Git transform ${attribute}=${value} for ${path}.`)
    }
  }
}

/** assertRegisteredGitlinks rejects embedded repositories without a declared transferable submodule boundary. */
export async function assertRegisteredGitlinks(root: string, tree: string, env: Record<string, string>): Promise<void> {
  const links = (await readTreeEntries(root, tree, env)).filter(entry => entry.mode === GitlinkMode)
  if (!links.length) {
    return
  }
  await Try(() => captureGit(root, ['submodule', 'status', '--', ...links.map(entry => entry.path)], { env }), {
    catch() {
      UserInput.fail('An undeclared embedded Git repository cannot be snapshotted; capture it separately.')
    },
  })
  const dirty = await captureGit(root, [
    'submodule',
    'foreach',
    '--quiet',
    '--recursive',
    'git --no-optional-locks status --porcelain=v1 -uall',
  ], { env })
  UserInput.require(!dirty, 'A submodule has saved changes; snapshot it separately before measuring the parent.')
}

/** assertMaterializedTree verifies raw bytes, symlinks and executable modes independently of Git status. */
export async function assertMaterializedTree(root: string, entries: TreeEntry[]): Promise<void> {
  const hashes = await readRegularFileHashes(root, entries)
  for (const entry of entries.filter(entry => entry.mode !== GitlinkMode)) {
    const path = Path.join(root, entry.path)
    const stat = await FS.lstat(path)
    const symbolic = entry.mode === SymlinkMode
    const hash = symbolic
      ? await captureGit(root, ['hash-object', '--stdin'], { input: await FS.readlink(path) })
      : hashes.get(entry.path)!
    const matchingType = stat.isSymbolicLink() === symbolic && hasExpectedMode(entry, stat.mode)
    if (hash.trim() !== entry.hash || !matchingType) {
      UserInput.fail(`Saved source differs from the captured Git tree: ${entry.path}.`)
    }
  }
}

const GitlinkMode = '160000'
const SymlinkMode = '120000'
const RegularFileMode = '100644'
const ExecutableMode = '100755'
const HashBatchSize = 128

async function readRegularFileHashes(root: string, entries: TreeEntry[]): Promise<Map<string, string>> {
  const files = entries.filter(isRegularTreeFile)
  const hashes = new Map<string, string>()
  for (let offset = 0; offset < files.length; offset += HashBatchSize) {
    const batch = files.slice(offset, offset + HashBatchSize)
    const paths = batch.map(entry => entry.path)
    const output = await captureGit(root, ['hash-object', '--no-filters', '--', ...paths])
    const values = output.trim().split(NewlineCharacter)
    UserInput.require(values.length === batch.length, 'Git did not return one raw content hash per source file.')
    batch.forEach((entry, index) => hashes.set(entry.path, values[index]))
  }
  return hashes
}

function hasExpectedMode(entry: TreeEntry, mode: number): boolean {
  return entry.mode === SymlinkMode || Boolean(mode & 0o111) === (entry.mode === ExecutableMode)
}
