import { Errors, NewlineCharacter, Regxs, UserInput } from '@shared'
import { git, type LandingIO } from './LandingIO'
import { pendingPreviewRecords, type PreviewRecord } from './PreviewRecords'
import { pinArchive, requireSourceHead } from './SourceIdentity'
import { requireOwnedStorageChanges } from './StorageStatus'

/** PublishedPreviewArchive retains the storage commit and source records published for a landing head. */
export type PublishedPreviewArchive = { commit: string; sources: string[]; landingHead: string }

/** publishPreviewArchive publishes validated task records, confirms the remote and pins the gitlink. */
export async function publishPreviewArchive(
  io: LandingIO,
  verifiedHead: string,
): Promise<PublishedPreviewArchive> {
  await requireSourceHead(io, verifiedHead)
  if ((await git(io, ['submodule', 'status', '--', '.storage'])).startsWith('-')) {
    await git(io, ['submodule', 'update', '--init', '--', '.storage'])
  }
  const records = await pendingPreviewRecords(io)
  const remote = await archiveRemote(io)
  await git(io, ['fetch', 'origin', remote], { storage: true })
  await reconcileArchive(io, remote, records)
  await copyRecords(io, records)
  const paths = records.flatMap(record => [`${record.directory}/record.json`, `${record.directory}/report.json`])
  if (paths.length) {
    await git(io, ['add', '--', ...paths], { storage: true })
  }
  if (await git(io, ['diff', '--cached', '--name-only'], { storage: true })) {
    await git(io, ['commit', '-m', 'Retain preview performance measurements', '--', ...paths], { storage: true })
  }
  const commit = await git(io, ['rev-parse', 'HEAD'], { storage: true })
  await requireSourceHead(io, verifiedHead)
  await git(io, ['push', 'origin', `${commit}:${remote}`], { storage: true })
  const advertised = await git(io, ['ls-remote', '--exit-code', 'origin', remote], { storage: true })
  if (advertised.split(Regxs.SingleWhitespaceRegx)[0] !== commit) {
    Errors.ThrowHostEnvironment('Archive remote changed after publication; rerun land to reconcile it safely.')
  }
  const landingHead = await pinArchive(io, verifiedHead, commit)
  return { commit, sources: records.map(record => record.source), landingHead }
}

async function archiveRemote(io: LandingIO): Promise<string> {
  const advertisement = await git(io, ['ls-remote', '--symref', 'origin', 'HEAD'], { storage: true })
  const remote = Regxs.GitRefHeadRegx.exec(advertisement)?.[1]
  if (!remote) {
    Errors.ThrowHostEnvironment('The storage remote did not advertise its default branch.')
  }
  return remote
}

async function reconcileArchive(io: LandingIO, remote: string, records: PreviewRecord[]): Promise<void> {
  await requireOwnedStorageChanges(io)
  const tip = await git(io, ['rev-parse', 'FETCH_HEAD'], { storage: true })
  const head = await git(io, ['rev-parse', 'HEAD'], { storage: true })
  const base = await git(io, ['merge-base', head, tip], { storage: true })
  if (base === head) {
    if (head !== tip) {
      await git(io, ['merge', '--ff-only', tip], { storage: true })
    }
    return
  }
  UserInput.Require(
    base === tip,
    'Storage history diverged; resolve it without rewriting history before retrying land.',
  )
  const local = (await git(io, ['log', '--format=', '--name-only', `${tip}..HEAD`], { storage: true })).split(
    NewlineCharacter,
  )
    .filter(Boolean)
  const allowed = new Set(
    records.flatMap(record => [`${record.directory}/record.json`, `${record.directory}/report.json`]),
  )
  if (local.some(path => !allowed.has(path))) {
    UserInput.Fail(`Storage has unpublished changes outside this task on ${remote}; refusing to publish them.`)
  }
}

async function copyRecords(io: LandingIO, records: PreviewRecord[]): Promise<void> {
  for (const record of records) {
    for (const [name, content] of [['record.json', record.record], ['report.json', record.report]]) {
      const path = `.storage/${record.directory}/${name}`
      if (await io.exists(path)) {
        if (await io.read(path) !== content) {
          UserInput.Fail(`The immutable archive already contains different bytes at ${path}.`)
        }
      } else {
        await io.write(path, content)
      }
    }
  }
}
