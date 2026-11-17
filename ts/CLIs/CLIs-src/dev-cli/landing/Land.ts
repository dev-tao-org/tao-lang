import { Json, NewlineCharacter, Regxs, UserInput } from '@shared'
import { type PublishedPreviewArchive, publishPreviewArchive } from './Archive'
import { integrateMain, requireClean, requireCleanBranch } from './Integration'
import { git, type LandingIO } from './LandingIO'
import { inspectLanding, type LandingProof, publishAndMerge } from './PullRequest'

/** land runs the authorized landing route; a changed integration head stops for renewed code review. */
export async function land(io: LandingIO): Promise<LandingProof> {
  const branch = await requireCleanBranch(io)
  const existing = await existingLanding(io, branch)
  if (existing) {
    return existing
  }
  const messagePath = `.artifacts/merge/${branch}.msg`
  const message = await reviewedMessage(io, messagePath)
  UserInput.require(
    !(await integrateMain(io)),
    'Main integration changed HEAD. Review the integrated changes and merge message, then rerun land.',
  )
  const reviewedHead = await git(io, ['rev-parse', 'HEAD'])
  await io.command('./agent', 'verify')
  await requireClean(io)
  UserInput.require(
    await git(io, ['rev-parse', 'HEAD']) === reviewedHead,
    'HEAD changed during verification; review it before rerunning land.',
  )
  const archive = await publishPreviewArchive(io, reviewedHead)
  if (![archive.commit, ...archive.sources].every(identity => message.includes(identity))) {
    UserInput.fail(
      `Review ${messagePath} with archive ${archive.commit} and measured sources ${
        archive.sources.join(', ')
      }, then rerun land.`,
    )
  }
  await requireClean(io)
  UserInput.require(
    await io.read(messagePath) === message,
    'The reviewed merge message changed while land was running; review it and rerun land.',
  )
  const proof = await publishAndMerge(io, branch, message, archive.landingHead)
  await io.write(`.artifacts/landing/${branch}.json`, formatLandingRecord({ ...proof, archive }))
  return proof
}

async function existingLanding(io: LandingIO, branch: string): Promise<LandingProof | undefined> {
  const proof = await inspectLanding(io, branch)
  if (!proof) {
    return undefined
  }
  UserInput.require(
    await git(io, ['rev-parse', 'HEAD']) === proof.sourceCommit,
    'This feature branch already landed and now has a different HEAD. Continue the new work on a new feature branch.',
  )
  const path = `.artifacts/landing/${branch}.json`
  if (!await io.exists(path)) {
    await io.write(path, formatLandingRecord(proof))
  }
  return proof
}

async function reviewedMessage(io: LandingIO, path: string): Promise<string> {
  if (!await io.exists(path)) {
    UserInput.fail(`Prepare and review the merge message at ${path} before landing.`)
  }
  const message = await io.read(path)
  const [title, blank, ...body] = message.trimEnd().split(NewlineCharacter)
  const hasValidTitle = Boolean(title) && title.length <= 72
  const hasRequiredBody = blank === '' && Boolean(body[0]?.startsWith('- '))
  UserInput.require(
    !(!hasValidTitle || !hasRequiredBody),
    'The reviewed merge message needs a title of at most 72 characters, a blank line and bullets.',
  )
  UserInput.require(
    !body.some(line => !Regxs.LandStatusLineRegx.test(line)),
    'The reviewed merge message body must contain contiguous bullets with indented continuation lines.',
  )
  return message
}

type LandingRecord = LandingProof & { archive?: PublishedPreviewArchive }

function formatLandingRecord(record: LandingRecord): string {
  return Json.Print(record) + NewlineCharacter
}
