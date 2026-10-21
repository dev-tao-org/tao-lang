import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import {
  applyPatch,
  assertSupportedTransforms,
  changedPaths,
  diffPatch,
  expandFiles,
  git,
  head,
  pathEntries,
  privateIndex,
  readJson,
  snapshot,
  tree,
  writeJson,
} from './ReviewGit'
import { assertOwnedSession, requireCleanReviewed, requireIdleSession } from './ReviewSession'
import type { ReviewSelection, ReviewSession } from './ReviewTypes'

/** planSelection freezes candidate content without advancing either branch or touching source bytes. */
export async function planSelection(
  session: ReviewSession,
  inputs: string[],
  patches?: { source?: string; reviewed: string },
): Promise<ReviewSelection> {
  await requireIdleSession(session)
  await assertOwnedSession(session)
  await requireCleanReviewed(session)
  const sourceHead = await head(session.root)
  const reviewedHead = await head(session.reviewedRoot)
  const files = await expandFiles(session.root, inputs, reviewedHead)
  const diskTree = await snapshot(session.root, session.directory, sourceHead, files)
  const indexTree = await tree(session.root)
  const candidates = patches
    ? await partialCandidates(session, files, sourceHead, reviewedHead, diskTree, indexTree, patches)
    : await wholeCandidates(session, files, sourceHead, reviewedHead, diskTree, indexTree)
  return await freezeSelection(session, { sourceHead, reviewedHead, files, diskTree, indexTree, ...candidates })
}

/** planReopen restores selected reviewed paths to their original base without changing source content. */
export async function planReopen(session: ReviewSession, inputs: string[]): Promise<ReviewSelection> {
  await requireIdleSession(session)
  await assertOwnedSession(session)
  await requireCleanReviewed(session)
  const sourceHead = await head(session.root)
  const reviewedHead = await head(session.reviewedRoot)
  const files = await expandFiles(session.root, inputs, [reviewedHead, session.baseCommit])
  const reviewed = await privateIndex(session.root, session.directory, reviewedHead)
  await replaceEntries(session.root, reviewed, session.baseCommit, files)
  const indexTree = await tree(session.root)
  return await freezeSelection(session, {
    sourceHead,
    reviewedHead,
    files,
    diskTree: await snapshot(session.root, session.directory, sourceHead, files),
    indexTree,
    sourceTree: await head(session.root, `${sourceHead}^{tree}`),
    reviewedTree: await tree(session.root, reviewed),
    reconciledIndexTree: indexTree,
    kind: 'reopen',
  })
}

/** validateSelection refuses stale plans before preparing branch updates. */
export async function validateSelection(session: ReviewSession, selection: ReviewSelection): Promise<void> {
  await assertOwnedSession(session)
  await requireCleanReviewed(session)
  if (selection.version !== 1 || selection.session !== session.id || !selection.files.length) {
    Errors.ThrowUserInput('Selection belongs to a different session or unsupported format.')
  }
  if (!/^[a-f0-9-]{36}$/.test(selection.proposal)) {
    Errors.ThrowUserInput('Selection proposal identity is invalid.')
  }
  const frozen = await readJson<ReviewSelection>(Path.join(session.directory, 'plans', `${selection.proposal}.json`))
  if (JSON.stringify(frozen) !== JSON.stringify(selection)) {
    Errors.ThrowUserInput('Selection differs from its immutable proposal. Generate a new plan.')
  }
  if (
    await head(session.root) !== selection.sourceHead || await head(session.reviewedRoot) !== selection.reviewedHead
  ) {
    Errors.ThrowUserInput('A branch moved after this proposal. Generate and inspect a new plan.')
  }
  const revisions = selection.kind === 'reopen' ? [selection.reviewedHead, session.baseCommit] : selection.reviewedHead
  const files = await expandFiles(session.root, selection.files, revisions)
  if (files.join('\0') !== selection.files.join('\0')) {
    Errors.ThrowUserInput('The literal selection changed after planning. Generate a new plan.')
  }
  const disk = await snapshot(session.root, session.directory, selection.sourceHead, files)
  const index = await tree(session.root)
  if (await pathEntries(session.root, disk, files) !== await pathEntries(session.root, selection.diskTree, files)) {
    Errors.ThrowUserInput(`Saved disk content changed after planning: ${files.join(', ')}`)
  }
  if (await pathEntries(session.root, index, files) !== await pathEntries(session.root, selection.indexTree, files)) {
    Errors.ThrowUserInput(`Staged content changed after planning: ${files.join(', ')}`)
  }
  await assertOnlySelected(session.root, selection.sourceHead, selection.sourceTree, files)
  await assertOnlySelected(session.root, selection.reviewedHead, selection.reviewedTree, files)
  await assertOnlySelected(session.root, selection.indexTree, selection.reconciledIndexTree, files)
  const reviewed = await privateIndex(session.root, session.directory, selection.reviewedTree)
  await assertSupportedTransforms(session.root, files, reviewed)
}

/** replaceEntries transfers literal object/mode entries, including deletions, between private indices. */
export async function replaceEntries(root: string, index: string, revision: string, files: string[]): Promise<void> {
  const removals = files.map(path => `0 ${'0'.repeat(40)}\t${path}\0`).join('')
  const entries = await pathEntries(root, revision, files)
  await git(root, ['update-index', '-z', '--index-info'], { index, input: removals + entries })
}

async function wholeCandidates(
  session: ReviewSession,
  files: string[],
  sourceHead: string,
  reviewedHead: string,
  diskTree: string,
  indexTree: string,
): Promise<Pick<ReviewSelection, 'sourceTree' | 'reviewedTree' | 'reconciledIndexTree' | 'kind'>> {
  const reviewed = await privateIndex(session.root, session.directory, reviewedHead)
  const reconciled = await privateIndex(session.root, session.directory, indexTree)
  await replaceEntries(session.root, reviewed, diskTree, files)
  await replaceEntries(session.root, reconciled, diskTree, files)
  await assertOnlySelected(session.root, sourceHead, diskTree, files)
  return {
    sourceTree: diskTree,
    reviewedTree: await tree(session.root, reviewed),
    reconciledIndexTree: await tree(session.root, reconciled),
    kind: 'files',
  }
}

async function partialCandidates(
  session: ReviewSession,
  files: string[],
  sourceHead: string,
  reviewedHead: string,
  diskTree: string,
  indexTree: string,
  patches: { source?: string; reviewed: string },
): Promise<Pick<ReviewSelection, 'sourceTree' | 'reviewedTree' | 'reconciledIndexTree' | 'kind'>> {
  return await Try(async () => {
    const source = await patchedTree(session, sourceHead, patches.source)
    const reviewed = await patchedTree(session, reviewedHead, patches.reviewed)
    await assertOnlySelected(session.root, sourceHead, source, files)
    await assertOnlySelected(session.root, reviewedHead, reviewed, files)
    const reviewedDelta = await diffPatch(session.root, reviewedHead, reviewed, files)
    const saved = await privateIndex(session.root, session.directory, diskTree)
    await applyPatch(session.root, saved, reviewedDelta, true)
    const committed = await privateIndex(session.root, session.directory, source)
    await applyPatch(session.root, committed, reviewedDelta, true)
    const reconciled = await reconcilePartial(session, files, sourceHead, source, diskTree, indexTree)
    return { sourceTree: source, reviewedTree: reviewed, reconciledIndexTree: reconciled, kind: 'partial' }
  }, {
    catch(error) {
      Errors.ThrowUserInput(
        `Partial selection cannot be applied safely for ${
          files.join(', ')
        }. Include the missing reviewed context or defer this selection. ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    },
  })
}

async function patchedTree(session: ReviewSession, base: string, path?: string): Promise<string> {
  const index = await privateIndex(session.root, session.directory, base)
  if (path) {
    const patch = await FileSystem.readFile(path, 'utf8')
    if (!patch.trim()) {
      Errors.ThrowUserInput(`Patch is empty: ${path}`)
    }
    await applyPatch(session.root, index, patch)
  }
  return await tree(session.root, index)
}

async function reconcilePartial(
  session: ReviewSession,
  files: string[],
  sourceHead: string,
  sourceTree: string,
  diskTree: string,
  indexTree: string,
): Promise<string> {
  const reconciled = await privateIndex(session.root, session.directory, indexTree)
  for (const path of files) {
    const patch = await diffPatch(session.root, sourceHead, sourceTree, [path])
    if (!patch) {
      continue
    }
    const disk = await privateIndex(session.root, session.directory, diskTree)
    await applyPatch(session.root, disk, patch, true)
    const unstaged = await Try.WithDefault(false, async () => {
      await applyPatch(session.root, reconciled, patch)
      return true
    })
    if (!unstaged) {
      const staged = await privateIndex(session.root, session.directory, indexTree)
      await applyPatch(session.root, staged, patch, true)
    }
  }
  return await tree(session.root, reconciled)
}

async function assertOnlySelected(root: string, before: string, after: string, files: string[]): Promise<void> {
  const outside = (await changedPaths(root, before, after)).filter(path => !files.includes(path))
  if (outside.length) {
    Errors.ThrowUserInput(`Patch changes paths outside the literal selection: ${outside.join(', ')}`)
  }
}

async function freezeSelection(
  session: ReviewSession,
  content: Omit<ReviewSelection, 'version' | 'proposal' | 'session'>,
): Promise<ReviewSelection> {
  const proposal = Platform.randomUUID()
  const selection: ReviewSelection = { version: 1, proposal, session: session.id, ...content }
  await FileSystem.mkdir(Path.join(session.directory, 'plans'), { recursive: true })
  const proposalPath = Path.join(session.directory, 'plans', `${proposal}.json`)
  await writeJson(proposalPath, selection)
  await FileSystem.chmod(proposalPath, 0o444)
  return selection
}
