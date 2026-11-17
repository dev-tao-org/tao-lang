import { Json, UserInput } from '@shared'
import { Errors, NullCharacter, Regxs, TabCharacter, Try } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import * as ReviewGit from './ReviewGit'
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
  const sourceHead = await ReviewGit.head(session.root)
  const reviewedHead = await ReviewGit.head(session.reviewedRoot)
  const files = await ReviewGit.expandFiles(session.root, inputs, reviewedHead)
  const diskTree = await ReviewGit.snapshot(session.root, session.directory, sourceHead, files)
  const indexTree = await ReviewGit.tree(session.root)
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
  const sourceHead = await ReviewGit.head(session.root)
  const reviewedHead = await ReviewGit.head(session.reviewedRoot)
  const files = await ReviewGit.expandFiles(session.root, inputs, [reviewedHead, session.baseCommit])
  const reviewed = await ReviewGit.privateIndex(session.root, session.directory, reviewedHead)
  await replaceEntries(session.root, reviewed, session.baseCommit, files)
  const indexTree = await ReviewGit.tree(session.root)
  return await freezeSelection(session, {
    sourceHead,
    reviewedHead,
    files,
    diskTree: await ReviewGit.snapshot(session.root, session.directory, sourceHead, files),
    indexTree,
    sourceTree: await ReviewGit.head(session.root, `${sourceHead}^{tree}`),
    reviewedTree: await ReviewGit.tree(session.root, reviewed),
    reconciledIndexTree: indexTree,
    kind: 'reopen',
  })
}

/** validateSelection refuses stale plans before preparing branch updates. */
export async function validateSelection(session: ReviewSession, selection: ReviewSelection): Promise<void> {
  await assertOwnedSession(session)
  await requireCleanReviewed(session)
  UserInput.require(
    !(selection.version !== 1 || selection.session !== session.id || !selection.files.length),
    'Selection belongs to a different session or unsupported format.',
  )
  UserInput.require(!!Regxs.ReviewProposalIdRegx.test(selection.proposal), 'Selection proposal identity is invalid.')
  const frozen = await ReviewGit.readJson<ReviewSelection>(
    Path.join(session.directory, 'plans', `${selection.proposal}.json`),
  )
  UserInput.require(
    encodeReviewSelection(frozen) === encodeReviewSelection(selection),
    'Selection differs from its immutable proposal. Generate a new plan.',
  )
  UserInput.require(
    !(await ReviewGit.head(session.root) !== selection.sourceHead
      || await ReviewGit.head(session.reviewedRoot) !== selection.reviewedHead),
    'A branch moved after this proposal. Generate and inspect a new plan.',
  )
  const revisions = selection.kind === 'reopen' ? [selection.reviewedHead, session.baseCommit] : selection.reviewedHead
  const files = await ReviewGit.expandFiles(session.root, selection.files, revisions)
  UserInput.require(
    files.join(NullCharacter) === selection.files.join(NullCharacter),
    'The literal selection changed after planning. Generate a new plan.',
  )
  const disk = await ReviewGit.snapshot(session.root, session.directory, selection.sourceHead, files)
  const index = await ReviewGit.tree(session.root)
  if (
    await ReviewGit.readGitPathEntries(session.root, disk, files)
      !== await ReviewGit.readGitPathEntries(session.root, selection.diskTree, files)
  ) {
    UserInput.fail(`Saved disk content changed after planning: ${files.join(', ')}`)
  }
  if (
    await ReviewGit.readGitPathEntries(session.root, index, files)
      !== await ReviewGit.readGitPathEntries(session.root, selection.indexTree, files)
  ) {
    UserInput.fail(`Staged content changed after planning: ${files.join(', ')}`)
  }
  await assertOnlySelected(session.root, selection.sourceHead, selection.sourceTree, files)
  await assertOnlySelected(session.root, selection.reviewedHead, selection.reviewedTree, files)
  await assertOnlySelected(session.root, selection.indexTree, selection.reconciledIndexTree, files)
  const reviewed = await ReviewGit.privateIndex(session.root, session.directory, selection.reviewedTree)
  await ReviewGit.assertSupportedTransforms(session.root, files, reviewed)
}

/** replaceEntries transfers literal object/mode entries, including deletions, between private indices. */
export async function replaceEntries(root: string, index: string, revision: string, files: string[]): Promise<void> {
  const removals = files.map(path => `0 ${GitRemovalObjectId}${TabCharacter}${path}${NullCharacter}`).join('')
  const entries = await ReviewGit.readGitPathEntries(root, revision, files)
  await ReviewGit.git(root, ['update-index', '-z', '--index-info'], { index, input: removals + entries })
}

const GitRemovalObjectId = '0'.repeat(40)

function encodeReviewSelection(selection: ReviewSelection): string {
  return Json.Print(selection)
}

async function wholeCandidates(
  session: ReviewSession,
  files: string[],
  sourceHead: string,
  reviewedHead: string,
  diskTree: string,
  indexTree: string,
): Promise<ReviewCandidateTrees> {
  const reviewed = await ReviewGit.privateIndex(session.root, session.directory, reviewedHead)
  const reconciled = await ReviewGit.privateIndex(session.root, session.directory, indexTree)
  await replaceEntries(session.root, reviewed, diskTree, files)
  await replaceEntries(session.root, reconciled, diskTree, files)
  await assertOnlySelected(session.root, sourceHead, diskTree, files)
  return {
    sourceTree: diskTree,
    reviewedTree: await ReviewGit.tree(session.root, reviewed),
    reconciledIndexTree: await ReviewGit.tree(session.root, reconciled),
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
): Promise<ReviewCandidateTrees> {
  return await Try(async () => {
    const source = await patchedTree(session, sourceHead, patches.source)
    const reviewed = await patchedTree(session, reviewedHead, patches.reviewed)
    await assertOnlySelected(session.root, sourceHead, source, files)
    await assertOnlySelected(session.root, reviewedHead, reviewed, files)
    const reviewedDelta = await ReviewGit.diffPatch(session.root, reviewedHead, reviewed, files)
    const saved = await ReviewGit.privateIndex(session.root, session.directory, diskTree)
    await ReviewGit.applyPatch(session.root, saved, reviewedDelta, true)
    const committed = await ReviewGit.privateIndex(session.root, session.directory, source)
    await ReviewGit.applyPatch(session.root, committed, reviewedDelta, true)
    const reconciled = await reconcilePartial(session, files, sourceHead, source, diskTree, indexTree)
    return { sourceTree: source, reviewedTree: reviewed, reconciledIndexTree: reconciled, kind: 'partial' }
  }, {
    catch(error) {
      UserInput.fail(
        `Partial selection cannot be applied safely for ${
          files.join(', ')
        }. Include the missing reviewed context or defer this selection. ${
          Errors.isNativeError(error) ? error.message : String(error)
        }`,
      )
    },
  })
}

async function patchedTree(session: ReviewSession, base: string, path?: string): Promise<string> {
  const index = await ReviewGit.privateIndex(session.root, session.directory, base)
  if (path) {
    const patch = await FS.readFile(path, 'utf8')
    if (!patch.trim()) {
      UserInput.fail(`Patch is empty: ${path}`)
    }
    await ReviewGit.applyPatch(session.root, index, patch)
  }
  return await ReviewGit.tree(session.root, index)
}

async function reconcilePartial(
  session: ReviewSession,
  files: string[],
  sourceHead: string,
  sourceTree: string,
  diskTree: string,
  indexTree: string,
): Promise<string> {
  const reconciled = await ReviewGit.privateIndex(session.root, session.directory, indexTree)
  for (const path of files) {
    const patch = await ReviewGit.diffPatch(session.root, sourceHead, sourceTree, [path])
    if (!patch) {
      continue
    }
    const disk = await ReviewGit.privateIndex(session.root, session.directory, diskTree)
    await ReviewGit.applyPatch(session.root, disk, patch, true)
    const unstaged = await Try.WithDefault(false, async () => {
      await ReviewGit.applyPatch(session.root, reconciled, patch)
      return true
    })
    if (!unstaged) {
      const staged = await ReviewGit.privateIndex(session.root, session.directory, indexTree)
      await ReviewGit.applyPatch(session.root, staged, patch, true)
    }
  }
  return await ReviewGit.tree(session.root, reconciled)
}

async function assertOnlySelected(root: string, before: string, after: string, files: string[]): Promise<void> {
  const outside = (await ReviewGit.changedPaths(root, before, after)).filter(path => !files.includes(path))
  if (outside.length) {
    UserInput.fail(`Patch changes paths outside the literal selection: ${outside.join(', ')}`)
  }
}

type ReviewSelectionIdentityKeys = 'version' | 'proposal' | 'session'
async function freezeSelection(
  session: ReviewSession,
  content: Omit<ReviewSelection, ReviewSelectionIdentityKeys>,
): Promise<ReviewSelection> {
  const proposal = Platform.randomUUID()
  const selection: ReviewSelection = { version: 1, proposal, session: session.id, ...content }
  await FS.mkdir(Path.join(session.directory, 'plans'))
  const proposalPath = Path.join(session.directory, 'plans', `${proposal}.json`)
  await ReviewGit.writeJson(proposalPath, selection)
  await FS.chmod(proposalPath, 0o444)
  return selection
}

type ReviewSelectionTreeKeys = 'sourceTree' | 'reviewedTree' | 'reconciledIndexTree' | 'kind'

type ReviewCandidateTrees = Pick<ReviewSelection, ReviewSelectionTreeKeys>
