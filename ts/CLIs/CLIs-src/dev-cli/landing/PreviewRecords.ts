import * as Performance from '@repo-analysis/performance'
import { Json } from '@shared'
import { Errors, NewlineCharacter, Regxs } from '@shared'
import { Platform } from '@shared/os'
import { git, type LandingIO } from './LandingIO'

/** PreviewRecord names one immutable measured source and its validated archive files. */
export type PreviewRecord = { source: string; record: string; report: string; directory: string }

/** pendingPreviewRecords validates prospective implementation records and their exact source/report identities. */
export async function pendingPreviewRecords(io: LandingIO): Promise<PreviewRecord[]> {
  const introduced = (await git(io, [
    'log',
    '--reverse',
    '--format=%H',
    '-S',
    'Retain one preview-performance record',
    'HEAD',
    '--',
    'AGENTS.md',
  ])).split(NewlineCharacter)[0]
  if (!introduced) {
    Errors.ThrowUserInput('Cannot locate the preview-record policy introduction in this branch.')
  }
  const commits = await git(io, [
    'rev-list',
    '--reverse',
    '--no-merges',
    '--ancestry-path',
    `${introduced}..HEAD`,
    '^origin/main',
  ])
  const result: PreviewRecord[] = []
  for (const source of commits.split(NewlineCharacter).filter(Boolean)) {
    const paths = (await git(io, ['diff-tree', '--no-commit-id', '--name-only', '-r', source])).split(NewlineCharacter)
      .filter(
        Boolean,
      )
    if (paths.every(isExemptPath)) {
      continue
    }
    result.push(await readRecord(io, source))
  }
  return result
}

function isExemptPath(path: string): boolean {
  const isInstructionPath = path === '.storage' || Regxs.AgentInstructionPathRegx.test(path)
  const isAgentTools = path.startsWith('agents/') || path.startsWith('.rulesync/')
  const isAgentEditors = path.startsWith('.codex/') || path.startsWith('.claude/')
  const isAgentConfiguration = isAgentTools || isAgentEditors
  const isEditorConfiguration = path.startsWith('.cursor/') || path.startsWith('Docs/')
  return isInstructionPath || isAgentConfiguration || isEditorConfiguration
}

async function readRecord(io: LandingIO, source: string): Promise<PreviewRecord> {
  const directory = `performance/preview/${source}`
  const pending = `.artifacts/notes/preview-history/${source}`
  const base = await io.exists(`${pending}/record.json`) ? pending : `.storage/${directory}`
  await requirePreviewRecordFiles(io, base, source)
  const record = await io.read(`${base}/record.json`)
  const report = await io.read(`${base}/report.json`)
  Performance.validatePreviewReport(report, source)
  const metadata = parseRecordMetadata(record)
  const tree = await git(io, ['rev-parse', `${source}^{tree}`])
  const fixture = await git(io, ['show', `${source}:${metadata.fixture?.path}`], { trim: false })
  if (!validMetadata(metadata, source, tree, report, fixture)) {
    Errors.ThrowUserInput(`Preview record ${source} is failed, unavailable, inconsistent or incomplete.`)
  }
  return { source, record, report, directory }
}

async function requirePreviewRecordFiles(io: LandingIO, base: string, source: string): Promise<void> {
  if (!await io.exists(`${base}/record.json`) || !await io.exists(`${base}/report.json`)) {
    Errors.ThrowUserInput(`Missing preview measurement for ${source}; historical capture is not available.`)
  }
}

type RecordMetadata = {
  version?: number
  status?: string
  sourceCommit?: string
  sourceTree?: string
  reportSha256?: string
  fixture?: { path?: string; sha256?: string }
}

function validMetadata(record: RecordMetadata, source: string, tree: string, report: string, fixture: string): boolean {
  const isPassedSource = record.version === 1 && record.status === 'passed' && record.sourceCommit === source
  const matchesSourceTree = record.sourceTree === tree && record.reportSha256 === Platform.hashText(report)
  const hasValidFixturePath = typeof record.fixture?.path === 'string' && record.fixture.path.endsWith('.tao')
  const matchesFixture = record.fixture?.sha256 === Platform.hashText(fixture)
  const matchesRecord = isPassedSource && matchesSourceTree
  const matchesFixtureRecord = hasValidFixturePath && matchesFixture
  return matchesRecord && matchesFixtureRecord
}

function parseRecordMetadata(contents: string): RecordMetadata {
  return Json.Parse(contents) as RecordMetadata
}
