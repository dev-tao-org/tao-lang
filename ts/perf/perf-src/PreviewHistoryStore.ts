import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'

/** HistoryRecord retains measured source identity independently from later archive commits. */
export type HistoryRecord = {
  version: 1
  sourceCommit: string
  sourceTree: string
  capturedAt: string
  status: 'passed' | 'failed' | 'unavailable'
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
  if (!await FileSystem.exists(Path.join(storage, '.git'))) {
    return [pending]
  }
  const top = (await git(['-C', storage, 'rev-parse', '--show-toplevel'])).trim()
  const parent = (await git(['-C', storage, 'rev-parse', '--show-superproject-working-tree'])).trim()
  if (!isStorageCheckout(top, parent, root, storage)) {
    Errors.ThrowUserInput('Performance archive must be this checkout’s initialized .storage submodule.')
  }
  return [Path.join(storage, 'performance/preview', commit), pending]
}

/** existingHistory reuses a complete valid record and refuses corrupt, partial or failed records. */
export async function existingHistory(
  directories: readonly string[],
  context: PreviewHistoryIdentity,
): Promise<string | undefined> {
  for (const directory of directories) {
    if (!await FileSystem.exists(directory)) {
      continue
    }
    const record = JSON.parse(await FileSystem.readFile(Path.join(directory, 'record.json'), 'utf8')) as HistoryRecord
    if (!matchesRecord(record, context)) {
      Errors.ThrowUserInput('Existing performance record is incomplete or differs from the source: ' + directory)
    }
    const report = await FileSystem.readFile(Path.join(directory, 'report.json'), 'utf8')
    if (Platform.hashText(report) !== record.reportSha256) {
      Errors.ThrowUserInput('Existing performance report checksum differs: ' + directory)
    }
    validatePreviewReport(report, context.sourceCommit)
    return directory
  }
  return undefined
}

/** writeHistory publishes a complete record directory by rename without replacing an earlier record. */
export async function writeHistory(directory: string, record: HistoryRecord, report?: string): Promise<void> {
  const staging = `${directory}.${Platform.randomUUID()}.pending`
  await FileSystem.mkdir(Path.dirname(directory), { recursive: true })
  await Try(async () => {
    await FileSystem.mkdir(staging)
    if (report !== undefined) {
      await FileSystem.writeFile(Path.join(staging, 'report.json'), report, 'utf8')
    }
    await FileSystem.writeFile(Path.join(staging, 'record.json'), JSON.stringify(record, null, 2) + '\n', 'utf8')
    if (await FileSystem.exists(directory)) {
      Errors.ThrowUserInput('Performance history already exists: ' + directory)
    }
    await FileSystem.rename(staging, directory)
  }, {
    finally: () => FileSystem.rm(staging, { recursive: true, force: true }),
  })
}

/** validatePreviewReport requires the raw capture to name the expected source commit and schema. */
export function validatePreviewReport(report: string, sourceCommit: string): void {
  const value: unknown = JSON.parse(report)
  if (!isSourceReport(value, sourceCommit)) {
    Errors.ThrowUserInput('The preview report does not identify the measured source commit and schema.')
  }
}

type FixtureIdentity = { path: string; sha256: string }
type PreviewHistoryIdentity = { sourceCommit: string; sourceTree: string; fixtureSha256: string }

function matchesRecord(
  record: HistoryRecord,
  context: PreviewHistoryIdentity,
): boolean {
  const sourceMatches = record.sourceCommit === context.sourceCommit && record.sourceTree === context.sourceTree
  const fixtureMatches = record.fixture?.sha256 === context.fixtureSha256
  return record.version === 1 && record.status === 'passed' && sourceMatches && fixtureMatches
}

function isStorageCheckout(top: string, parent: string, root: string, storage: string): boolean {
  return parent !== '' && Path.resolve(top) === Path.resolve(storage) && Path.resolve(parent) === Path.resolve(root)
}

function isSourceReport(value: unknown, sourceCommit: string): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return 'version' in value && value.version === 1 && 'commit' in value && value.commit === sourceCommit
}
