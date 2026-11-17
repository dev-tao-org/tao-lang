import { NullCharacter, Regxs, UserInput } from '@shared'
import { git, type LandingIO } from './LandingIO'
import { pendingPreviewRecords } from './PreviewRecords'

/** requireOwnedStorageChanges permits retry files only when each byte matches a validated current-branch record. */
export async function requireOwnedStorageChanges(io: LandingIO): Promise<void> {
  const status = await git(io, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ], { storage: true, trim: false })
  if (!status) {
    return
  }
  const records = await pendingPreviewRecords(io)
  const allowed = new Map(records.flatMap(record => [
    [`${record.directory}/record.json`, record.record],
    [`${record.directory}/report.json`, record.report],
  ]))
  for (const entry of status.split(NullCharacter).filter(Boolean)) {
    const path = entry.slice(3)
    const expected = allowed.get(path)
    UserInput.Require(
      !(expected === undefined || Regxs.GitStatusChangeCodeRegx.test(entry.slice(0, 2))),
      'Storage contains changes outside this task; preserve and resolve them before landing.',
    )
    if (!await io.exists(`.storage/${path}`) || await io.read(`.storage/${path}`) !== expected) {
      UserInput.Fail(`Storage retry bytes differ from the validated pending record: ${path}.`)
    }
  }
}
