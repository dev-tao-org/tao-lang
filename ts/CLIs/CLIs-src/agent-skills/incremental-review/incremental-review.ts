import { IO } from '@cli-kit'
import { Json, UserInput } from '@shared'
import { Lists } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { Process } from '@shared/os'
import { acceptSelection, recoverAcceptance } from './ReviewAccept'
import { continueReview } from './ReviewContinue'
import { expandFiles, git, readJson, writeJson } from './ReviewGit'
import { planReopen, planSelection } from './ReviewPlan'
import * as ReviewSessionModule2 from './ReviewSession'
import type { IncrementalReviewResult, ReviewSelection, ReviewSession } from './ReviewTypes'

/** main prints the incremental-review result for the skill's thin entry script. */
export async function main(): Promise<void> {
  IO.print(formatReviewResult(await runReview(Process.argv.slice(2))))
}

/** runReview executes the incremental-review protocol against one explicit implementation checkout. */
export async function runReview(args: string[]): Promise<IncrementalReviewResult> {
  const command = args[0]
  if (!command || ['help', '--help', '-h'].includes(command)) {
    return {
      commands: [
        'start --base main --branch feat/<topic>-incremental-review-approved [--worktree PATH]',
        'continue --from OLD_IMPLEMENTATION --branch feat/<topic>-incremental-review-approved [--worktree PATH]',
        'rename --branch feat/<topic>-incremental-review-approved',
        'status',
        'plan --files PATH... --out JSON [--source-patch PATCH --reviewed-patch PATCH]',
        'accept --files PATH... | accept --selection JSON',
        'reopen --files PATH...',
        'recheck --files PATH... [--state pending|clear]',
        'note --text TEXT',
        'recover',
      ],
      scope: 'Every command accepts --repo ROOT. Use saved disk content; stage state is preserved.',
    }
  }
  const options = parseOptions(args.slice(1))
  const root =
    (await git(Path.resolve(single(options, 'repo') ?? Repo.getWorkspaceRoot()), ['rev-parse', '--show-toplevel']))
      .trim()
  return await ReviewSessionModule2.withReviewLock(root, async () => {
    const startsReview = command === 'start' || command === 'continue'
    if (startsReview) {
      const session = command === 'continue'
        ? await continueReview(
          root,
          required(options, 'from'),
          required(options, 'branch'),
          single(options, 'worktree'),
        )
        : await ReviewSessionModule2.startReview(
          root,
          single(options, 'base') ?? 'main',
          required(options, 'branch'),
          single(options, 'worktree'),
        )
      return { session: session.id, reviewedBranch: session.reviewedBranch, reviewedRoot: session.reviewedRoot }
    }
    return await runSessionCommand(command, options, await ReviewSessionModule2.loadSession(root))
  })
}

type Options = Map<string, string[]>
type NoteCommand = 'note' | 'recheck'
type SelectionCommand = 'plan' | 'accept'
type OptionalPath = string | undefined
type ReviewNoteResult = { notes: string[]; recheck: string[] }

function formatReviewResult(result: IncrementalReviewResult): string {
  return Json.Print(result)
}

async function runSessionCommand(
  command: string,
  options: Options,
  session: ReviewSession,
): Promise<IncrementalReviewResult> {
  if (command === 'status') {
    return await ReviewSessionModule2.reviewStatus(session)
  }
  if (command === 'rename') {
    await ReviewSessionModule2.renameReviewBranch(session, required(options, 'branch'))
    return { reviewedBranch: session.reviewedBranch }
  }
  if (command === 'recover') {
    await recoverAcceptance(session)
    return { recovered: true }
  }
  if (command === 'plan' || command === 'accept') {
    return await runSelectionCommand(command, options, session)
  }
  if (command === 'reopen') {
    const selection = await planReopen(session, options.get('files') ?? [])
    await acceptSelection(session, selection)
    return { reopened: selection.files }
  }
  if (command === 'note' || command === 'recheck') {
    return await runNoteCommand(command, options, session)
  }
  UserInput.fail('Expected start, continue, rename, status, plan, accept, reopen, recheck, note or recover.')
}

async function runNoteCommand(
  command: NoteCommand,
  options: Options,
  session: ReviewSession,
): Promise<ReviewNoteResult> {
  if (command === 'note') {
    session.notes.push(required(options, 'text'))
  } else {
    const files = await expandFiles(session.root, options.get('files') ?? [], session.reviewedBranch)
    const state = single(options, 'state') ?? 'pending'
    UserInput.require(!!['pending', 'clear'].includes(state), '--state must be pending or clear.')
    session.recheck = state === 'clear'
      ? session.recheck.filter(path => !files.includes(path))
      : Lists.unique(session.recheck, files)
  }
  await ReviewSessionModule2.saveSession(session)
  return { notes: session.notes, recheck: session.recheck }
}

async function runSelectionCommand(
  command: SelectionCommand,
  options: Options,
  session: ReviewSession,
): Promise<IncrementalReviewResult> {
  const selectionFile = single(options, 'selection')
  const reviewed = single(options, 'reviewed-patch')
  const source = single(options, 'source-patch')
  const hasFileOrPatchOptions = options.has('files') || reviewed || source
  UserInput.require(!(selectionFile && hasFileOrPatchOptions), 'Use either --selection or --files, not both.')
  UserInput.require(!(source && !reviewed), '--source-patch requires --reviewed-patch against the reviewed baseline.')
  const selection = await resolveSelection(selectionFile, session, options, source, reviewed)
  if (command === 'plan') {
    const out = Path.resolve(required(options, 'out'))
    if (await FS.exists(out)) {
      UserInput.fail(`Proposal destination already exists: ${out}`)
    }
    await writeJson(out, selection)
    return {
      proposal: out,
      sourceDiff: `git diff ${selection.sourceHead} ${selection.sourceTree}`,
      reviewedDiff: `git diff ${selection.reviewedHead} ${selection.reviewedTree}`,
    }
  }
  await acceptSelection(session, selection)
  return { accepted: selection.files, kind: selection.kind }
}

async function resolveSelection(
  selectionFile: OptionalPath,
  session: ReviewSession,
  options: Options,
  source: OptionalPath,
  reviewed: OptionalPath,
): Promise<ReviewSelection> {
  if (selectionFile) {
    return await readJson<ReviewSelection>(Path.resolve(selectionFile))
  }
  const files = options.get('files') ?? []
  if (reviewed) {
    return await planSelection(session, files, { source, reviewed })
  }
  return await planSelection(session, files, undefined)
}

function parseOptions(args: string[]): Options {
  const options: Options = new Map()
  const known = [
    'repo',
    'base',
    'from',
    'branch',
    'worktree',
    'files',
    'out',
    'selection',
    'source-patch',
    'reviewed-patch',
    'text',
    'state',
  ]
  let current: OptionalPath
  for (const arg of args) {
    if (arg.startsWith('--') && known.includes(arg.slice(2))) {
      current = arg.slice(2)
      if (options.has(current)) {
        UserInput.fail(`Option repeated: ${arg}`)
      }
      options.set(current, [])
    } else if (current) {
      options.get(current)!.push(arg)
    } else {
      UserInput.fail(`Expected a named option, received ${arg}.`)
    }
  }
  return options
}

function single(options: Options, name: string): string | undefined {
  const values = options.get(name)
  if (values && values.length !== 1) {
    UserInput.fail(`--${name} requires exactly one value.`)
  }
  return values?.[0]
}

function required(options: Options, name: string): string {
  return single(options, name) ?? UserInput.fail(`--${name} is required.`)
}
