import { Errors } from '@shared'
import { Path } from '@shared/os'
import { type LandingIO } from './LandingIO'
import { pendingPreviewRecords } from './PreviewRecords'

/** requireOwnedStorageChanges permits retry files only when each byte matches a validated current-branch record. */
export async function requireOwnedStorageChanges(io: LandingIO): Promise<void> {
  const status = await io.command('git', [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ], Path.join(io.root, '.storage'))
  if (!status) {
    return
  }
  const records = await pendingPreviewRecords(io)
  const allowed = new Map(records.flatMap(record => [
    [`${record.directory}/record.json`, record.record],
    [`${record.directory}/report.json`, record.report],
  ]))
  for (const entry of status.split('\0').filter(Boolean)) {
    const path = entry.slice(3)
    const expected = allowed.get(path)
    if (expected === undefined || /[DRCU!]/.test(entry.slice(0, 2))) {
      Errors.ThrowUserInput('Storage contains changes outside this task; preserve and resolve them before landing.')
    }
    if (!await io.exists(`.storage/${path}`) || await io.read(`.storage/${path}`) !== expected) {
      Errors.ThrowUserInput(`Storage retry bytes differ from the validated pending record: ${path}.`)
    }
  }
}
