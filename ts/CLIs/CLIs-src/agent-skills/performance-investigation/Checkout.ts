import * as CLIKit from '@cli-kit'
import { Json, UserInput } from '@shared'
import { Regxs } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { captureGit, resolveCommit } from './Git'
import type { PerformanceSnapshot } from './Snapshot'
import { assertMaterializedTree, assertNoContentTransforms, readTreeEntries } from './SourceTree'

/** receiveSnapshot verifies transferred bytes and checks out an immutable checkpoint in a new owned clone. */
export async function receiveSnapshot(
  bundle: string,
  manifest: string,
  directory: string,
  ref?: string,
): Promise<void> {
  UserInput.require(
    !(await FS.exists(directory)),
    'Snapshot destination already exists; select a new runner directory.',
  )
  const snapshot = Json.Parse(await FS.readFile(manifest, 'utf8')) as PerformanceSnapshot
  const actualHash = Platform.hashBytes(await FS.readFile(bundle), 'sha256')
  UserInput.require(
    !(snapshot.version !== 1 || snapshot.bundleSha256 !== actualHash),
    'Snapshot bundle checksum or manifest schema differs; transfer it again.',
  )
  const commit = ref ?? snapshot.commit
  UserInput.require(!!Regxs.Sha1HashRegx.test(commit), 'Select a full immutable commit SHA from the snapshot history.')
  await FS.mkdir(Path.dirname(directory))
  await CLIKit.runNonInteractiveCommand('git', ['clone', '--no-checkout', '--', bundle, directory])
  UserInput.require(
    await resolveCommit(directory, commit) === commit,
    'The transferred bundle does not contain the requested checkpoint.',
  )
  await captureGit(directory, ['read-tree', commit])
  const entries = await readTreeEntries(directory, commit)
  await assertNoContentTransforms(directory, entries.map(entry => entry.path), true)
  await captureGit(directory, [
    '-c',
    'core.autocrlf=false',
    '-c',
    'core.symlinks=true',
    '-c',
    'core.filemode=true',
    'checkout',
    '--force',
    '--detach',
    commit,
  ])
  await assertMaterializedTree(directory, entries)
}
