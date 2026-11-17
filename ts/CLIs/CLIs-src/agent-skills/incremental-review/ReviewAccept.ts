import * as Shared from '@shared'
import { Json, Try, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import * as ReviewGit from './ReviewGit'
import { replaceEntries, validateSelection } from './ReviewPlan'
import { assertOwnedSession, assertReviewedSnapshot, saveSession } from './ReviewSession'
import type { ReviewJournal, ReviewSelection, ReviewSession } from './ReviewTypes'

/** acceptSelection validates both trees and journals exact commits before advancing either branch. */
export async function acceptSelection(
  session: ReviewSession,
  selection: ReviewSelection,
): Promise<void> {
  await requireFinishedJournal(session)
  await validateSelection(session, selection)
  const journal = await prepareJournal(session, selection)
  await ReviewGit.writeJson(resolveJournalPath(session), journal)
  await finishJournal(session, journal)
}

/** recoverAcceptance completes a frozen journal idempotently without reverting source edits. */
export async function recoverAcceptance(session: ReviewSession): Promise<void> {
  const journal = await ReviewGit.readJson<ReviewJournal>(resolveJournalPath(session))
  if (journal.phase === 'complete') {
    return
  }
  UserInput.Require(journal.selection.session === session.id, 'Recovery journal belongs to a different review session.')
  await finishJournal(session, journal)
}

async function prepareJournal(session: ReviewSession, selection: ReviewSelection): Promise<ReviewJournal> {
  const index = await ReviewGit.resolveGitIndexPath(session.root)
  const originalIndexHash = await ReviewGit.indexHash(index)
  const reconciledIndex = Path.join(session.directory, `${Platform.randomUUID()}.reconciled.index`)
  await FS.cp(index, reconciledIndex)
  if (
    await ReviewGit.readGitPathEntries(session.root, selection.indexTree, selection.files)
      !== await ReviewGit.readGitPathEntries(session.root, selection.reconciledIndexTree, selection.files)
  ) {
    await replaceEntries(session.root, reconciledIndex, selection.reconciledIndexTree, selection.files)
  }
  const sourceCommit = await createCommit(
    session,
    selection.sourceHead,
    selection.sourceTree,
    'Accept reviewed source corrections',
  )
  const reviewedCommit = await createCommit(
    session,
    selection.reviewedHead,
    selection.reviewedTree,
    reviewedMessage(selection, sourceCommit),
  )
  return {
    selection,
    sourceCommit,
    reviewedCommit,
    originalIndexHash,
    reconciledIndexHash: await ReviewGit.indexHash(reconciledIndex),
    reconciledIndex,
    phase: 'prepared',
  }
}

function reviewedMessage(selection: ReviewSelection, sourceCommit: string): string {
  const action = selection.kind === 'reopen' ? 'reopen' : 'accept'
  return Shared.joinTextLines(
    `Review: ${action} ${selection.files.length} path(s)`,
    '',
    `Source: ${sourceCommit}`,
    `Approval: ${selection.proposal}`,
    `Kind: ${selection.kind}`,
    ...selection.files.map(path => `Path: ${Json.Print(path)}`),
  )
}

async function requireFinishedJournal(session: ReviewSession): Promise<void> {
  if (await FS.exists(resolveJournalPath(session))) {
    const journal = await ReviewGit.readJson<ReviewJournal>(resolveJournalPath(session))
    UserInput.Require(
      journal.phase === 'complete',
      'An interrupted acceptance is pending. Run recover before accepting another selection.',
    )
  }
}

async function createCommit(
  session: ReviewSession,
  parent: string,
  candidate: string,
  message: string,
): Promise<string> {
  if (await ReviewGit.head(session.root, `${parent}^{tree}`) === candidate) {
    return parent
  }
  return (await ReviewGit.git(session.root, ['commit-tree', candidate, '-p', parent, '-m', message])).trim()
}

async function finishJournal(session: ReviewSession, journal: ReviewJournal): Promise<void> {
  await assertOwnedSession(session)
  await assertReviewedSnapshot(session, journal)
  await requireExpectedRefs(session, journal)
  const sourceIndex = await ReviewGit.resolveGitIndexPath(session.root)
  const lock = `${sourceIndex}.lock`
  await acquireIndexLock(lock, session, journal)
  await Try(async () => {
    await requireExpectedIndex(sourceIndex, journal)
    await requirePreparedDisk(session, journal)
    if (await ReviewGit.head(session.root) === journal.selection.sourceHead) {
      await ReviewGit.git(session.root, [
        'update-ref',
        `refs/heads/${session.sourceBranch}`,
        journal.sourceCommit,
        journal.selection.sourceHead,
      ])
    }
    await recordPhase(session, journal, 'source')
    await installIndex(sourceIndex, lock, journal)
    await recordPhase(session, journal, 'index')
    await finishReviewed(session, journal)
  }, { finally: () => FS.rm(lock, { force: true }) })
  for (const path of journal.selection.files) {
    if (journal.selection.kind === 'reopen') {
      delete session.accepted[path]
    } else {
      session.accepted[path] = await ReviewGit.readGitPathEntries(session.root, journal.selection.diskTree, [path])
    }
  }
  if (journal.selection.kind !== 'partial') {
    session.recheck = session.recheck.filter(path => !journal.selection.files.includes(path))
  }
  await saveSession(session)
  await recordPhase(session, journal, 'complete')
}

async function requireExpectedRefs(session: ReviewSession, journal: ReviewJournal): Promise<void> {
  const source = await ReviewGit.head(session.root)
  const reviewed = await ReviewGit.head(session.reviewedRoot)
  UserInput.Require(
    !![journal.selection.sourceHead, journal.sourceCommit].includes(source),
    'Implementation branch moved outside the frozen journal; recovery will not overwrite it.',
  )
  UserInput.Require(
    !![journal.selection.reviewedHead, journal.reviewedCommit].includes(reviewed),
    'Reviewed branch moved outside the frozen journal; recovery will not overwrite it.',
  )
}

async function requirePreparedDisk(session: ReviewSession, journal: ReviewJournal): Promise<void> {
  if (journal.phase !== 'prepared' || await ReviewGit.head(session.root) !== journal.selection.sourceHead) {
    return
  }
  const selection = journal.selection
  const disk = await ReviewGit.snapshot(session.root, session.directory, selection.sourceHead, selection.files)
  UserInput.Require(
    await ReviewGit.readGitPathEntries(session.root, disk, selection.files)
      === await ReviewGit.readGitPathEntries(session.root, selection.diskTree, selection.files),
    'Saved selected content changed before the source commit. Recovery will not accept unseen changes.',
  )
}

async function requireExpectedIndex(path: string, journal: ReviewJournal): Promise<void> {
  const hash = await ReviewGit.indexHash(path)
  UserInput.Require(
    !![journal.originalIndexHash, journal.reconciledIndexHash].includes(hash),
    'The implementation index changed during acceptance; recovery will not overwrite staged work.',
  )
  UserInput.Require(
    await ReviewGit.indexHash(journal.reconciledIndex) === journal.reconciledIndexHash,
    'The retained reconciled index changed; recovery cannot safely continue.',
  )
}

async function installIndex(path: string, lock: string, journal: ReviewJournal): Promise<void> {
  if (await ReviewGit.indexHash(path) !== journal.reconciledIndexHash) {
    const pending = `${lock}.${Platform.randomUUID()}.pending`
    await FS.cp(journal.reconciledIndex, pending)
    await FS.rename(pending, path)
  }
}

async function finishReviewed(session: ReviewSession, journal: ReviewJournal): Promise<void> {
  await assertReviewedSnapshot(session, journal)
  if (await ReviewGit.head(session.reviewedRoot) !== journal.reviewedCommit) {
    if (await ReviewGit.tree(session.reviewedRoot) !== journal.selection.reviewedTree) {
      await ReviewGit.git(session.reviewedRoot, [
        'read-tree',
        '-u',
        '-m',
        journal.selection.reviewedHead,
        journal.reviewedCommit,
      ])
    }
    await ReviewGit.git(session.root, [
      'update-ref',
      `refs/heads/${session.reviewedBranch}`,
      journal.reviewedCommit,
      journal.selection.reviewedHead,
    ])
  }
  await recordPhase(session, journal, 'reviewed')
}

async function acquireIndexLock(path: string, session: ReviewSession, journal: ReviewJournal): Promise<void> {
  const token = encodeIndexLockToken(session, journal)
  if (await FS.exists(path)) {
    UserInput.Require(
      await FS.readFile(path, 'utf8') === token,
      'A foreign Git index lock exists; recovery will not remove it.',
    )
    await FS.rm(path)
  }
  await FS.writeFile(path, token, { flag: 'wx' })
}

async function recordPhase(
  session: ReviewSession,
  journal: ReviewJournal,
  phase: ReviewJournal['phase'],
): Promise<void> {
  journal.phase = phase
  if (phase === 'complete') {
    await FS.mkdir(Path.join(session.directory, 'receipts'))
    await ReviewGit.writeJson(Path.join(session.directory, 'receipts', `${journal.selection.proposal}.json`), journal)
  }
  await ReviewGit.writeJson(resolveJournalPath(session), journal)
}

function encodeIndexLockToken(session: ReviewSession, journal: ReviewJournal): string {
  return Json.Print({ session: session.id, proposal: journal.selection.proposal })
}

function resolveJournalPath(session: ReviewSession): string {
  return Path.join(session.directory, 'journal.json')
}
