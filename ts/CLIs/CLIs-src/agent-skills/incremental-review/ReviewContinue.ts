import { Objects, Regxs, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { git, head, writeJson } from './ReviewGit'
import * as ReviewSessionModule2 from './ReviewSession'
import type { ReviewSession } from './ReviewTypes'

/** continueReview forks accepted content and historical evidence into an independently owned review. */
export async function continueReview(
  root: string,
  from: string,
  branch: string,
  worktree?: string,
): Promise<ReviewSession> {
  const previousRoot = (await git(Path.resolve(from), ['rev-parse', '--show-toplevel'])).trim()
  UserInput.require(previousRoot !== root, 'Continue requires a different implementation checkout.')
  await requireSameRepository(root, previousRoot)
  return await ReviewSessionModule2.withReviewLock(previousRoot, async () => {
    const previous = await ReviewSessionModule2.loadSession(previousRoot)
    await ReviewSessionModule2.requireIdleSession(previous)
    await ReviewSessionModule2.assertOwnedSession(previous)
    await ReviewSessionModule2.requireCleanReviewed(previous)
    const reviewedHead = await head(previous.reviewedRoot)
    const session = await ReviewSessionModule2.prepareReview(root, previous.base, previous.baseCommit, branch, worktree)
    session.accepted = Objects.copy(previous.accepted)
    session.recheck = [...previous.recheck]
    session.notes = [...previous.notes]
    session.continuation = {
      session: previous.id,
      root: previous.root,
      reviewedBranch: previous.reviewedBranch,
      reviewedHead,
    }
    await requireEmptyHistory(session)
    await retainHistory(previous, session)
    await ReviewSessionModule2.createReview(session, reviewedHead)
    return session
  })
}

async function requireSameRepository(root: string, previousRoot: string): Promise<void> {
  const args = ['rev-parse', '--path-format=absolute', '--git-common-dir']
  UserInput.require(
    (await git(root, args)).trim() === (await git(previousRoot, args)).trim(),
    'Continue requires implementation checkouts from the same Git repository.',
  )
}

async function requireEmptyHistory(session: ReviewSession): Promise<void> {
  const parent = Path.dirname(session.directory)
  for (const entry of await FS.readdir(parent)) {
    if (entry !== 'active') {
      UserInput.fail(`Destination review history already exists: ${Path.join(parent, entry)}`)
    }
  }
  const active = (await FS.readdir(session.directory)).filter(entry => entry !== 'operation.lock')
  UserInput.require(!active.length, 'Destination review state already exists; preserve it before continuing.')
}

async function retainHistory(previous: ReviewSession, session: ReviewSession): Promise<void> {
  const evidence = Path.join(session.directory, 'evidence/previous')
  await FS.mkdir(evidence)
  await writeJson(Path.join(evidence, 'session.json'), previous)
  await copyHistoricalFiles(Path.dirname(previous.directory), Path.dirname(session.directory), false)
  for (const directory of ['receipts', 'plans', 'evidence']) {
    await copyHistoricalFiles(Path.join(previous.directory, directory), Path.join(evidence, directory))
  }
}

async function copyHistoricalFiles(source: string, destination: string, descend = true): Promise<void> {
  if (!await FS.exists(source)) {
    return
  }
  for (const entry of await FS.readdir(source, { withFileTypes: true })) {
    const path = Path.join(source, entry.name)
    const target = Path.join(destination, entry.name)
    if (isHistoricalText(entry)) {
      await FS.mkdir(destination)
      await FS.writeFile(target, await FS.readFile(path))
    } else if (descend && isHistoricalDirectory(entry)) {
      await copyHistoricalFiles(path, target)
    } else {
      // Only retained text records are evidence; links, indices and active transaction state stay behind.
    }
  }
}

function isHistoricalText(entry: { name: string; isFile(): boolean }): boolean {
  return entry.isFile() && Regxs.ReviewArtifactSuffixRegx.test(entry.name) && entry.name !== 'journal.json'
}

function isHistoricalDirectory(entry: { name: string; isDirectory(): boolean }): boolean {
  return entry.isDirectory() && entry.name !== 'active'
}
