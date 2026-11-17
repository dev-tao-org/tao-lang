import { Json, UserInput } from '@shared'
import { NewlineCharacter, NullCharacter, Time, Try } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { captureGit, resolveCommit } from './Git'
import * as SourceTree from './SourceTree'

/** PerformanceSnapshot identifies a transferable source tree independently of the developer's stage state. */
export type PerformanceSnapshot = {
  version: 1
  capturedAt: string
  sourceHead: string
  commit: string
  tree: string
  dirty: boolean
  status: string
  bundle: string
  bundleSha256: string
  submodules: string[]
}

/** createSnapshot exports saved bytes and history through a disposable index and private object store. */
export async function createSnapshot(root: string, ref?: string): Promise<PerformanceSnapshot> {
  const directory = Path.join(root, '.artifacts/notes/performance-investigation/snapshots', Platform.randomUUID())
  await FS.mkdir(directory)
  const before = await readControllerState(root)
  const sourceHead = before.head
  const scratch = Path.join(directory, 'scratch.git')
  await captureGit(root, ['init', '--bare', scratch])
  const objects = (await captureGit(root, ['rev-parse', '--path-format=absolute', '--git-path', 'objects'])).trim()
  const env = {
    GIT_INDEX_FILE: Path.join(directory, 'snapshot.index'),
    GIT_OBJECT_DIRECTORY: Path.join(scratch, 'objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
  }
  return await Try(async () => {
    const base = ref ? await resolveCommit(root, ref) : sourceHead
    const tree = ref
      ? (await captureGit(root, ['rev-parse', `${base}^{tree}`])).trim()
      : await snapshotSavedTree(root, base, env)
    UserInput.require(
      !(!ref && tree !== await snapshotSavedTree(root, base, env)),
      'Source changed during snapshot capture; retry after the save completes.',
    )
    await assertControllerUnchanged(root, before)
    const commit = ref ? base : await createSnapshotCommit(root, tree, base, env)
    const bundle = Path.join(directory, 'snapshot.bundle')
    await captureGit(scratch, ['update-ref', 'refs/heads/performance-snapshot', commit], { env })
    await captureGit(scratch, ['symbolic-ref', 'HEAD', 'refs/heads/performance-snapshot'], { env })
    await captureGit(scratch, ['bundle', 'create', bundle, 'HEAD', 'refs/heads/performance-snapshot'], { env })
    const context = { sourceHead, commit, tree, bundle, before, env, savedSource: !ref }
    const snapshot = await describeSnapshot(root, context)
    await FS.writeFile(
      Path.join(directory, 'snapshot.json'),
      Json.Print(snapshot) + NewlineCharacter,
    )
    return snapshot
  }, {
    async finally() {
      await FS.rm(scratch, { recursive: true, force: true })
      await FS.rm(env.GIT_INDEX_FILE, { force: true })
      await assertControllerUnchanged(root, before)
    },
  })
}

type ControllerState = { head: string; indexPath: string; indexHash?: string; status: string }
type SnapshotContext = {
  sourceHead: string
  commit: string
  tree: string
  bundle: string
  before: ControllerState
  env: Record<string, string>
  savedSource: boolean
}

async function snapshotSavedTree(root: string, base: string, env: Record<string, string>): Promise<string> {
  await assertCleanSubmodules(root)
  await captureGit(root, ['read-tree', base], { env })
  const files = await selectSavedFiles(root, base)
  const input = files.join(NullCharacter) + NullCharacter
  await SourceTree.assertNoContentTransforms(root, files)
  if (files.length) {
    await captureGit(root, [
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.filemode=true',
      '-c',
      'core.symlinks=true',
      'add',
      '-A',
      '--pathspec-from-file=-',
      '--pathspec-file-nul',
    ], { env, input })
  }
  const tree = (await captureGit(root, ['write-tree'], { env })).trim()
  await SourceTree.assertRegisteredGitlinks(root, tree, env)
  const entries = await SourceTree.readTreeEntries(root, tree, env)
  await SourceTree.assertMaterializedTree(root, entries)
  return tree
}

async function selectSavedFiles(root: string, base: string): Promise<string[]> {
  const tracked = (await captureGit(root, ['ls-tree', '-r', '--name-only', '-z', base]))
    .split(NullCharacter).filter(Boolean)
  const current = (await captureGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']))
    .split(NullCharacter).filter(Boolean)
  const saved = current.filter(path => Try.WithDefault(false, () => !!FS.lstatSync(Path.join(root, path))))
  return [...new Set([...tracked, ...saved])].filter(path => !path.startsWith('.artifacts/'))
}

async function assertCleanSubmodules(root: string): Promise<void> {
  const dirty = await captureGit(root, [
    'submodule',
    'foreach',
    '--quiet',
    '--recursive',
    'git --no-optional-locks status --porcelain=v1 -uall',
  ])
  UserInput.require(dirty === '', 'A submodule has saved changes; snapshot it separately before measuring the parent.')
}

async function createSnapshotCommit(root: string, tree: string, base: string, env: Record<string, string>) {
  return (await captureGit(root, [
    '-c',
    'user.name=Tao Performance',
    '-c',
    'user.email=performance@example.invalid',
    'commit-tree',
    tree,
    '-p',
    base,
  ], { env, input: 'Private performance snapshot; controller HEAD and index unchanged.\n' })).trim()
}

async function describeSnapshot(root: string, context: SnapshotContext): Promise<PerformanceSnapshot> {
  const entries = await captureGit(root, ['ls-tree', '-r', context.tree], { env: context.env })
  const headTree = (await captureGit(root, ['rev-parse', `${context.sourceHead}^{tree}`])).trim()
  return {
    version: 1,
    capturedAt: Time.date().toISOString(),
    sourceHead: context.sourceHead,
    commit: context.commit,
    tree: context.tree,
    dirty: context.savedSource && context.tree !== headTree,
    status: context.before.status,
    bundle: context.bundle,
    bundleSha256: Platform.hashBytes(await FS.readFile(context.bundle), 'sha256'),
    submodules: entries.split(NewlineCharacter).filter(line => line.startsWith('160000 ')),
  }
}

async function readControllerState(root: string): Promise<ControllerState> {
  const indexPath = (await captureGit(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).trim()
  return {
    head: await resolveCommit(root, 'HEAD'),
    indexPath,
    indexHash: await hashExistingIndex(indexPath),
    status: await captureGit(root, ['status', '--porcelain=v1', '-uall', '--ignore-submodules=none']),
  }
}

async function hashExistingIndex(path: string): Promise<string | undefined> {
  return await FS.exists(path) ? Platform.hashBytes(await FS.readFile(path), 'sha256') : undefined
}

async function assertControllerUnchanged(root: string, before: ControllerState): Promise<void> {
  const after = await readControllerState(root)
  UserInput.require(
    !(before.head !== after.head || before.indexHash !== after.indexHash || before.status !== after.status),
    'Controller HEAD, index or source status changed during capture; snapshot not accepted.',
  )
}
