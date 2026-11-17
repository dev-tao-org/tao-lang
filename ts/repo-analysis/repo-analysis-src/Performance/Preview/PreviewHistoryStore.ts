import { Json, UserInput } from '@shared'
import { NewlineCharacter, Try } from '@shared'
import { FS, Path, Platform } from '@shared/os'

/** HistoryRecord retains measured source identity independently from later archive commits. */
export type HistoryRecord = {
  version: 1
  sourceCommit: string
  sourceTree: string
  capturedAt: string
  status: HistoryStatus
  command: string
  fixture: FixtureIdentity
  scenarios: string[]
  sourceIsolation: string
  reportSha256?: string
  error?: string
}

/** resolveHistoryDirectories chooses initialized submodule storage or the persistent pending-record directory. */
export async function resolveHistoryDirectories(
  root: string,
  commit: string,
  git: (args: readonly string[]) => Promise<string>,
): Promise<string[]> {
  const pending = Path.join(root, '.artifacts/notes/preview-history', commit)
  const storage = Path.join(root, '.storage')
  if (!await FS.exists(Path.join(storage, '.git'))) {
    return [pending]
  }
  const top = (await git(['-C', storage, 'rev-parse', '--show-toplevel'])).trim()
  const parent = (await git(['-C', storage, 'rev-parse', '--show-superproject-working-tree'])).trim()
  UserInput.require(
    !!isStorageCheckout(top, parent, root, storage),
    'Performance archive must be this checkout’s initialized .storage submodule.',
  )
  return [Path.join(storage, 'performance/preview', commit), pending]
}

/** existingHistory reuses a complete valid record and refuses corrupt, partial or failed records. */
export async function existingHistory(
  directories: readonly string[],
  context: PreviewHistoryIdentity,
): Promise<string | undefined> {
  for (const directory of directories) {
    if (!await FS.exists(directory)) {
      continue
    }
    const recordText = await FS.readFile(Path.join(directory, 'record.json'), 'utf8')
    const record = parseHistoryRecord(recordText)
    if (!matchesRecord(record, context)) {
      UserInput.fail('Existing performance record is incomplete or differs from the source: ' + directory)
    }
    const report = await FS.readFile(Path.join(directory, 'report.json'), 'utf8')
    if (Platform.hashText(report) !== record.reportSha256) {
      UserInput.fail('Existing performance report checksum differs: ' + directory)
    }
    validatePreviewReport(report, context.sourceCommit)
    return directory
  }
  return undefined
}

/** writeHistory publishes a complete record directory by rename without replacing an earlier record. */
export async function writeHistory(directory: string, record: HistoryRecord, report?: string): Promise<void> {
  const staging = `${directory}.${Platform.randomUUID()}.pending`
  await FS.mkdir(Path.dirname(directory))
  await Try(async () => {
    await FS.createExclusiveDirectory(staging)
    if (report !== undefined) {
      await FS.writeFile(Path.join(staging, 'report.json'), report, 'utf8')
    }
    const recordText = serializeHistoryRecord(record)
    await FS.writeFile(Path.join(staging, 'record.json'), recordText, 'utf8')
    if (await FS.exists(directory)) {
      UserInput.fail('Performance history already exists: ' + directory)
    }
    await FS.rename(staging, directory)
  }, {
    finally: () => FS.rm(staging, { recursive: true, force: true }),
  })
}

/** validatePreviewReport requires the raw capture to name the expected source commit and schema. */
export function validatePreviewReport(report: string, sourceCommit: string): void {
  const value = parsePreviewReport(report)
  UserInput.require(
    !!isSourceReport(value, sourceCommit),
    'The preview report does not identify the measured source commit and schema.',
  )
}

function parseHistoryRecord(source: string): HistoryRecord {
  return Json.Parse(source) as HistoryRecord
}

function serializeHistoryRecord(record: HistoryRecord): string {
  return Json.Print(record) + NewlineCharacter
}

function parsePreviewReport(source: string): unknown {
  return Json.Parse(source)
}

type FixtureIdentity = { path: string; sha256: string }
type PreviewHistoryIdentity = { sourceCommit: string; sourceTree: string; fixtureSha256: string }
type HistoryStatus = 'passed' | 'failed' | 'unavailable'

function matchesRecord(
  record: HistoryRecord,
  context: PreviewHistoryIdentity,
): boolean {
  const sourceMatches = record.sourceCommit === context.sourceCommit && record.sourceTree === context.sourceTree
  const fixtureMatches = record.fixture?.sha256 === context.fixtureSha256
  const isSuccessfulRecord = record.version === 1 && record.status === 'passed'
  return isSuccessfulRecord && sourceMatches && fixtureMatches
}

function isStorageCheckout(top: string, parent: string, root: string, storage: string): boolean {
  return parent !== '' && Path.resolve(top) === Path.resolve(storage) && Path.resolve(parent) === Path.resolve(root)
}

function isSourceReport(value: unknown, sourceCommit: string): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('version' in value) || value.version !== 1) {
    return false
  }
  return 'commit' in value && value.commit === sourceCommit
}
