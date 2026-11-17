import { IO } from '@cli-kit'
import { Json, Objects, UserInput } from '@shared'
import { FS, Path, Process, Repo } from '@shared/os'
import { applyLearningProposal, findScan, preflightProposal } from './LearningPatches'
import { runCandidateScan } from './LearningQueries'
import { safeSourcePath, withLearningState } from './LearningStore'
import type { LearningState, LearningStatus, ReviewLearningCommandResult } from './LearningTypes'
import { readLearningInput, requireId, requirePaths, validateCorrection, validateProposal } from './LearningValidation'

/** main prints the review-learning skill result without changing Git state. */
export async function main(): Promise<void> {
  IO.print(formatLearningResult(await runLearning(Process.argv.slice(2))))
}

/** runLearning executes correction capture, candidate scans and the guarded patch queue. */
export async function runLearning(args: string[]): Promise<ReviewLearningCommandResult> {
  const command = args[0]
  if (!command || ['help', '--help', '-h'].includes(command)) {
    return {
      commands: [
        'capture --input JSON',
        'scan --rule ID [--files PATH...]',
        'propose --input JSON',
        'apply --proposal ID [--protected-files PATH...]',
        'recover --proposal ID',
        'status',
        'checkpoint --group NAME [--protected-files PATH...]',
      ],
      scope: 'All commands accept --repo ROOT; no command approves content or changes Git state.',
    }
  }
  const options = parseOptions(args.slice(1))
  const root = Path.resolve(single(options, 'repo') ?? Repo.getWorkspaceRoot())
  UserInput.Require(FS.realpathSync(root) === root, 'Use a real checkout path without symbolic links.')
  return await withLearningState(root, state => executeCommand(command, options, state))
}

type Options = Map<string, string[]>
type OptionalOptionName = string | undefined

function formatLearningResult(result: ReviewLearningCommandResult): string {
  return Json.Print(result)
}

async function executeCommand(
  command: string,
  options: Options,
  state: LearningState,
): Promise<ReviewLearningCommandResult> {
  if (command === 'status') {
    return describeLearningStatus(state)
  }
  if (command === 'capture') {
    const correction = validateCorrection(state.root, await readLearningInput(required(options, 'input')))
    assertNewId(state.corrections, correction.id)
    UserInput.Require(
      !(correction.supersedes && !state.corrections.some(record => record.id === correction.supersedes)),
      'supersedes must identify an existing correction.',
    )
    state.corrections.push(correction)
    return { correction }
  }
  if (command === 'scan') {
    const id = required(options, 'rule')
    const correction = state.corrections.find(record => record.id === id)
    if (!correction) {
      UserInput.Fail(`Unknown correction: ${id}`)
    }
    const files = requirePaths(state.root, options.get('files') ?? [], 'files')
    const scan = await runCandidateScan(state.root, correction, files)
    state.scans.push(scan)
    return Objects.copy(scan)
  }
  if (command === 'propose') {
    const proposal = validateProposal(state.root, await readLearningInput(required(options, 'input')))
    assertNewId(state.proposals, proposal.id)
    findScan(state, proposal.scan)
    await preflightProposal(state, proposal, [])
    state.proposals.push(proposal)
    return { proposal }
  }
  return await executeQueueCommand(command, options, state)
}

function describeLearningStatus(state: LearningState): LearningStatus {
  const appliedProposals = state.proposals.filter(proposal => proposal.state === 'applied').map(proposal => proposal.id)
  return { ...state, appliedProposals }
}

async function executeQueueCommand(
  command: string,
  options: Options,
  state: LearningState,
): Promise<ReviewLearningCommandResult> {
  if (command === 'checkpoint') {
    state.protectedFiles = requirePaths(
      state.root,
      options.get('protected-files') ?? state.protectedFiles,
      'protected-files',
    )
    const event = {
      group: required(options, 'group'),
      scans: state.scans.map(scan => scan.id),
      pending: state.proposals.filter(proposal => proposal.state !== 'applied').map(proposal => proposal.id),
    }
    state.events.push(event)
    return { event, protectedFiles: state.protectedFiles }
  }
  if (command === 'apply' || command === 'recover') {
    const id = required(options, 'proposal')
    const proposal = state.proposals.find(record => record.id === id)
    if (!proposal) {
      UserInput.Fail(`Unknown proposal: ${id}`)
    }
    const protectedFiles = (options.get('protected-files') ?? []).map(file => safeSourcePath(state.root, file, true))
    await applyLearningProposal(state, proposal, protectedFiles)
    return { proposal: id, state: proposal.state, pendingHumanReview: true }
  }
  UserInput.Fail('Expected capture, scan, propose, apply, recover, status or checkpoint.')
}

function assertNewId(records: { id: string }[], id: string): void {
  requireId(id)
  if (records.some(record => record.id === id)) {
    UserInput.Fail(`Identity already exists; history cannot be overwritten: ${id}`)
  }
}

function parseOptions(args: string[]): Options {
  const options: Options = new Map()
  const known = ['repo', 'input', 'rule', 'files', 'proposal', 'protected-files', 'group']
  let current: OptionalOptionName
  for (const arg of args) {
    if (arg.startsWith('--')) {
      current = arg.slice(2)
      if (!known.includes(current) || options.has(current)) {
        UserInput.Fail(`Unknown or repeated option: ${arg}`)
      }
      options.set(current, [])
    } else if (current) {
      options.get(current)!.push(arg)
    } else {
      UserInput.Fail(`Expected a named option: ${arg}`)
    }
  }
  return options
}

function single(options: Options, name: string): string | undefined {
  const values = options.get(name)
  if (values && values.length !== 1) {
    UserInput.Fail(`--${name} requires one value.`)
  }
  return values?.[0]
}

function required(options: Options, name: string): string {
  return single(options, name) ?? UserInput.Fail(`--${name} is required.`)
}
