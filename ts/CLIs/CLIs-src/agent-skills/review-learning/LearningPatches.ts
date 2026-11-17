import { Lists, Objects, Source, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { loadSession, requireIdleSession, saveSession, withReviewLock } from '../incremental-review/ReviewSession'
import type { ReviewSession } from '../incremental-review/ReviewTypes'
import * as LearningStore from './LearningStore'
import type { LearningFileHashes, LearningSnapshot, LearningState, Proposal, Scan } from './LearningTypes'
import { validateCorrectionAuthority } from './LearningValidation'

/** preflightProposal checks snapshot identity, protected scope and nonoverlapping original spans. */
export async function preflightProposal(
  state: LearningState,
  proposal: Proposal,
  protectedFiles: string[],
): Promise<void> {
  const scan = findScan(state, proposal.scan)
  validateCorrectionAuthority(state.root, scan.correction)
  await assertFreshScan(state.root, scan, proposal)
  const protectedScope = [...state.protectedFiles, ...proposal.protectedFiles ?? [], ...protectedFiles]
  for (const file of new Set(proposal.edits.map(edit => edit.file))) {
    LearningStore.safeSourcePath(state.root, file)
    if (!scan.selected.includes(file)) {
      UserInput.fail(`Patch file was not scanned: ${file}`)
    }
    if (LearningStore.isInScope(file, protectedScope)) {
      UserInput.fail(`Protected active review file: ${file}`)
    }
    const content = proposal.outputs?.[file]?.before ?? await FS.readFile(Path.join(state.root, file), 'utf8')
    buildOutput(proposal, file, content)
  }
}

/** applyLearningProposal journals intended outputs and resumes without overwriting foreign edits. */
export async function applyLearningProposal(
  state: LearningState,
  proposal: Proposal,
  protectedFiles: string[],
): Promise<void> {
  const path = Path.join(state.root, '.artifacts/notes/incremental-review/active/session.json')
  if (await FS.exists(path)) {
    await LearningStore.ensureProjectMetadataDirectory(state.root, Path.dirname(path))
    await withReviewLock(state.root, () => applyLockedProposal(state, proposal, protectedFiles))
  } else {
    await applyLockedProposal(state, proposal, protectedFiles)
  }
}

/** findScan resolves an immutable scan identity from retained history. */
export function findScan(state: LearningState, id: string): Scan {
  return state.scans.find(scan => scan.id === id) ?? UserInput.fail(`Unknown scan: ${id}`)
}

async function applyLockedProposal(state: LearningState, proposal: Proposal, protectedFiles: string[]): Promise<void> {
  UserInput.require(proposal.state !== 'applied', 'Proposal already applied; pending human review is unchanged.')
  const scan = findScan(state, proposal.scan)
  UserInput.require(
    scan.correction.authority !== 'inferred',
    'An inferred rule cannot apply; capture a new explicit correction with supersedes evidence.',
  )
  await preflightProposal(state, proposal, protectedFiles)
  await retainOutputs(state.root, proposal)
  proposal.state = 'applying'
  await LearningStore.saveLearningState(state)
  await markAcceptedPending(state.root, Object.keys(proposal.outputs!))
  for (const [file, output] of Object.entries(proposal.outputs!)) {
    const path = Path.join(state.root, file)
    LearningStore.safeSourcePath(state.root, file)
    const content = await FS.readFile(path, 'utf8')
    if (content !== output.before && content !== output.after) {
      UserInput.fail(`Foreign edits conflict with interrupted proposal: ${file}`)
    }
    if (content !== output.after) {
      await replaceSource(path, output.after)
    }
    output.done = true
    await LearningStore.saveLearningState(state)
  }
  proposal.state = 'applied'
  await LearningStore.saveLearningState(state)
}

async function assertFreshScan(root: string, scan: Scan, proposal: Proposal): Promise<void> {
  const current = await LearningStore.snapshotScope(root, scan.correction)
  const expected = Objects.copy(scan.files)
  const inputs = Objects.copy(scan.inputs)
  for (const [file, output] of Object.entries(proposal.outputs ?? {})) {
    const currentHash = current.files[file]
    const afterHash = Platform.hashText(output.after)
    if (currentHash === afterHash) {
      expected[file] = afterHash
      inputs[file] = afterHash
    }
  }
  UserInput.require(
    !hasChangedSnapshot(scan, current, expected, inputs),
    'Scan is stale: scope membership, source or configuration changed. Rescan before applying.',
  )
}

function hasChangedSnapshot(
  scan: Scan,
  current: LearningSnapshot,
  files: LearningFileHashes,
  inputs: LearningFileHashes,
): boolean {
  const changedSources = LearningStore.haveDifferentLearningFileHashes(current.files, files)
    || LearningStore.haveDifferentLearningFileHashes(current.inputs, inputs)
  return scan.queryVersion !== 1 || changedSources
    || LearningStore.haveDifferentLearningFileHashes(current.configs, scan.configs)
}

function buildOutput(proposal: Proposal, file: string, original: string): string {
  const edits = proposal.edits.filter(edit => edit.file === file).sort(Source.compareByRange)
  let previousEnd = -1
  let previousStart = -1
  for (const edit of edits) {
    if (hasInvalidEdit(edit, original, previousStart, previousEnd)) {
      UserInput.fail(`Overlapping or stale original spans: ${file}`)
    }
    previousEnd = edit.range.end - 1
    previousStart = edit.range.start
  }
  let result = original
  for (const edit of edits.toReversed()) {
    result = Source.replace(result, edit, edit.replacement)
  }
  return result
}

function hasInvalidEdit(
  edit: Proposal['edits'][number],
  original: string,
  previousStart: number,
  previousEnd: number,
): boolean {
  const overlapsPriorEdit = edit.range.start === previousStart || edit.range.start <= previousEnd
  const exceedsOriginal = edit.range.end > original.length
  const expectedTextChanged = Source.slice(original, edit) !== edit.expected
  return overlapsPriorEdit || exceedsOriginal || expectedTextChanged
}

async function retainOutputs(root: string, proposal: Proposal): Promise<void> {
  if (proposal.outputs) {
    return
  }
  proposal.outputs = {}
  for (const file of new Set(proposal.edits.map(edit => edit.file))) {
    const before = await FS.readFile(Path.join(root, file), 'utf8')
    proposal.outputs[file] = { before, after: buildOutput(proposal, file, before), done: false }
  }
}

async function replaceSource(path: string, content: string): Promise<void> {
  const temporary = `${path}.${Platform.randomUUID()}.review-learning-pending`
  const mode = FS.statSync(path).mode
  await FS.writeFile(temporary, content, { flag: 'wx', mode })
  await FS.rename(temporary, path)
}

async function markAcceptedPending(root: string, files: string[]): Promise<void> {
  const path = Path.join(root, '.artifacts/notes/incremental-review/active/session.json')
  if (!await FS.exists(path)) {
    return
  }
  const session = await loadSession(root)
  await requireIdleSession(session)
  const affected = files.filter(file => hasAcceptedContent(session, file))
  session.recheck = Lists.unique(session.recheck, affected)
  await saveSession(session)
}

function hasAcceptedContent(session: ReviewSession, file: string): boolean {
  return file in session.accepted
}
