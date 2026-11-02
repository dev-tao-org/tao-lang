import { runNonInteractiveCommand } from '@cli-kit'
import { Errors, Regxs } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
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
  if (await FileSystem.exists(directory)) {
    Errors.ThrowUserInput('Snapshot destination already exists; select a new runner directory.')
  }
  const snapshot = JSON.parse(await FileSystem.readFile(manifest, 'utf8')) as PerformanceSnapshot
  const actualHash = Platform.hashBytes(await FileSystem.readFile(bundle), 'sha256')
  if (snapshot.version !== 1 || snapshot.bundleSha256 !== actualHash) {
    Errors.ThrowUserInput('Snapshot bundle checksum or manifest schema differs; transfer it again.')
  }
  const commit = ref ?? snapshot.commit
  if (!Regxs.Sha1HashRegx.test(commit)) {
    Errors.ThrowUserInput('Select a full immutable commit SHA from the snapshot history.')
  }
  await FileSystem.mkdir(Path.dirname(directory))
  await runNonInteractiveCommand('git clone --no-checkout', { variadicArgs: ['--', bundle, directory] })
  if (await resolveCommit(directory, commit) !== commit) {
    Errors.ThrowUserInput('The transferred bundle does not contain the requested checkpoint.')
  }
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
