import { Errors, Json, Regxs } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { safeSourcePath } from './LearningStore'
import type { Correction, Proposal } from './LearningTypes'

/** readLearningInput reads a JSON data file without evaluating code. */
export async function readLearningInput(input: string): Promise<unknown> {
  return Json.Parse(await FileSystem.readFile(Path.resolve(input), 'utf8'))
}

/** validateCorrection validates the closed query schema and preserves authority evidence. */
export function validateCorrection(root: string, input: unknown): Correction {
  const record = requireRecord(input)
  requireId(record.id)
  for (const field of ['evidence', 'before', 'after']) {
    requireText(record[field], field)
  }
  const scope = requirePaths(root, record.scope, 'scope')
  if (!scope.length) {
    Errors.ThrowUserInput('scope must select at least one project path.')
  }
  if (!Array.isArray(record.exceptions) || record.exceptions.some(value => typeof value !== 'string')) {
    Errors.ThrowUserInput('exceptions must be an array of semantic exception descriptions.')
  }
  const exceptions = record.exceptions as string[]
  const excludedPaths = requirePaths(root, record.excludedPaths ?? [], 'excludedPaths')
  const rule = requireRecord(record.rule)
  validateRule(root, rule)
  if (record.supersedes !== undefined) {
    requireId(record.supersedes)
  }
  const correction = { ...record, scope, exceptions, excludedPaths, rule } as Correction
  validateCorrectionAuthority(root, correction)
  return correction
}

/** validateProposal validates exact spans before queueing source edits. */
export function validateProposal(root: string, input: unknown): Proposal {
  const record = requireRecord(input)
  requireId(record.id)
  requireId(record.scan)
  requireText(record.analysis, 'analysis')
  if (!Array.isArray(record.edits) || !record.edits.length) {
    Errors.ThrowUserInput('edits must be a nonempty array.')
  }
  const edits = record.edits.map(inputEdit => {
    const edit = requireRecord(inputEdit)
    requireText(edit.file, 'file')
    const file = safeSourcePath(root, edit.file as string)
    if (hasInvalidOffsets(edit)) {
      Errors.ThrowUserInput('Edit offsets must be ordered nonnegative integers.')
    }
    if (typeof edit.expected !== 'string' || typeof edit.replacement !== 'string') {
      Errors.ThrowUserInput('Edit expected and replacement must be strings.')
    }
    return { ...edit, file } as Proposal['edits'][number]
  })
  const protectedFiles = requirePaths(root, record.protectedFiles ?? [], 'protectedFiles')
  return {
    id: record.id as string,
    scan: record.scan as string,
    analysis: record.analysis as string,
    edits,
    protectedFiles,
    state: 'pending',
  }
}

/** requirePaths validates literal project scopes while allowing the project root explicitly. */
export function requirePaths(root: string, input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.some(path => typeof path !== 'string')) {
    Errors.ThrowUserInput(`${label} must be an array of literal paths.`)
  }
  return input.map(path => safeSourcePath(root, path, true) || '.')
}

/** requireId prevents ambiguous ledger identities and metadata path traversal. */
export function requireId(input: unknown): asserts input is string {
  if (typeof input !== 'string' || !Regxs.LearningIdentifierRegx.test(input)) {
    Errors.ThrowUserInput('IDs must contain only letters, digits, underscores and hyphens.')
  }
}

/** validateCorrectionAuthority checks retained authority against the current cited project source. */
export function validateCorrectionAuthority(root: string, correction: Correction): void {
  if (
    typeof correction.authority !== 'string' || !['explicit', 'existing', 'inferred'].includes(correction.authority)
  ) {
    Errors.ThrowUserInput('authority must be explicit, existing or inferred.')
  }
  if (correction.authority !== 'existing') {
    return
  }
  const source = requireRecord(correction.authoritySource)
  requireText(source.file, 'authoritySource.file')
  requireText(source.quote, 'authoritySource.quote')
  const file = safeSourcePath(root, source.file as string)
  const text = FileSystem.readFileSync(Path.join(root, file), 'utf8')
  if (!text.includes(source.quote as string)) {
    Errors.ThrowUserInput('Existing authority quote must appear in the cited project source.')
  }
  correction.authoritySource = { file, quote: source.quote as string }
}

function requireRecord(input: unknown): Record<string, unknown> {
  if (!isJsonRecord(input)) {
    Errors.ThrowUserInput('Expected a JSON object.')
  }
  return input
}

function hasInvalidOffsets(edit: Record<string, unknown>): boolean {
  const range = isJsonRecord(edit.range) ? edit.range : {}
  const invalidStart = !Number.isInteger(range.start) || Number(range.start) < 0
  const invalidEnd = !Number.isInteger(range.end) || Number(range.end) < Number(range.start)
  return invalidStart || invalidEnd
}

function isJsonRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function requireText(input: unknown, label: string): void {
  if (typeof input !== 'string' || !input.trim()) {
    Errors.ThrowUserInput(`${label} requires nonempty text.`)
  }
}

function validateRule(root: string, rule: Record<string, unknown>): void {
  if (rule.kind === 'call-name') {
    requireText(rule.name, 'rule.name')
  } else if (rule.kind === 'call-symbol') {
    requireText(rule.declarationFile, 'rule.declarationFile')
    safeSourcePath(root, rule.declarationFile as string)
    requireText(rule.declarationName, 'rule.declarationName')
  } else if (rule.kind === 'function-length') {
    if (!Number.isInteger(rule.maxLines) || Number(rule.maxLines) < 0) {
      Errors.ThrowUserInput('rule.maxLines must be a nonnegative integer.')
    }
  } else if (rule.kind !== 'returned-method') {
    Errors.ThrowUserInput('Unknown query kind; executable JSON queries are not supported.')
  } else {
    // returned-method has no query parameters.
  }
}
