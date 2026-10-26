import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { FileSystem, Path, Platform, Repo } from '@shared/os'
import { acceptSelection, recoverAcceptance } from './ReviewAccept'
import { continueReview } from './ReviewContinue'
import { expandFiles, git, readJson, writeJson } from './ReviewGit'
import { planReopen, planSelection } from './ReviewPlan'
import {
  loadSession,
  renameReviewBranch,
  reviewStatus,
  saveSession,
  startReview,
  withReviewLock,
} from './ReviewSession'
import type { ReviewHooks, ReviewSelection, ReviewSession } from './ReviewTypes'

/** main prints the incremental-review result for the skill's thin entry script. */
export async function main(): Promise<void> {
  IO.print(JSON.stringify(await runReview(Platform.argv.slice(2)), null, 2))
}

/** runReview executes the incremental-review protocol against one explicit implementation checkout. */
export async function runReview(args: string[], hooks: ReviewHooks = {}): Promise<Record<string, unknown>> {
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
  return await withReviewLock(root, async () => {
    if (command === 'start' || command === 'continue') {
      const session = command === 'continue'
        ? await continueReview(
          root,
          required(options, 'from'),
          required(options, 'branch'),
          single(options, 'worktree'),
        )
        : await startReview(
          root,
          single(options, 'base') ?? 'main',
          required(options, 'branch'),
          single(options, 'worktree'),
        )
      return { session: session.id, reviewedBranch: session.reviewedBranch, reviewedRoot: session.reviewedRoot }
    }
    return await runSessionCommand(command, options, await loadSession(root), hooks)
  })
}

type Options = Map<string, string[]>

async function runSessionCommand(
  command: string,
  options: Options,
  session: ReviewSession,
  hooks: ReviewHooks,
): Promise<Record<string, unknown>> {
  if (command === 'status') {
    return await reviewStatus(session)
  }
  if (command === 'rename') {
    await renameReviewBranch(session, required(options, 'branch'))
    return { reviewedBranch: session.reviewedBranch }
  }
  if (command === 'recover') {
    await recoverAcceptance(session)
    return { recovered: true }
  }
  if (command === 'plan' || command === 'accept') {
    return await runSelectionCommand(command, options, session, hooks)
  }
  if (command === 'reopen') {
    const selection = await planReopen(session, options.get('files') ?? [])
    await acceptSelection(session, selection, hooks)
    return { reopened: selection.files }
  }
  if (command === 'note' || command === 'recheck') {
    return await runNoteCommand(command, options, session)
  }
  Errors.ThrowUserInput('Expected start, continue, rename, status, plan, accept, reopen, recheck, note or recover.')
}

async function runNoteCommand(
  command: 'note' | 'recheck',
  options: Options,
  session: ReviewSession,
): Promise<Record<string, unknown>> {
  if (command === 'note') {
    session.notes.push(required(options, 'text'))
  } else {
    const files = await expandFiles(session.root, options.get('files') ?? [], session.reviewedBranch)
    const state = single(options, 'state') ?? 'pending'
    if (!['pending', 'clear'].includes(state)) {
      Errors.ThrowUserInput('--state must be pending or clear.')
    }
    session.recheck = state === 'clear'
      ? session.recheck.filter(path => !files.includes(path))
      : [...new Set([...session.recheck, ...files])]
  }
  await saveSession(session)
  return { notes: session.notes, recheck: session.recheck }
}

async function runSelectionCommand(
  command: 'plan' | 'accept',
  options: Options,
  session: Awaited<ReturnType<typeof loadSession>>,
  hooks: ReviewHooks,
): Promise<Record<string, unknown>> {
  const selectionFile = single(options, 'selection')
  const reviewed = single(options, 'reviewed-patch')
  const source = single(options, 'source-patch')
  if (selectionFile && (options.has('files') || reviewed || source)) {
    Errors.ThrowUserInput('Use either --selection or --files, not both.')
  }
  if (source && !reviewed) {
    Errors.ThrowUserInput('--source-patch requires --reviewed-patch against the reviewed baseline.')
  }
  const selection = selectionFile
    ? await readJson<ReviewSelection>(Path.resolve(selectionFile))
    : await planSelection(session, options.get('files') ?? [], reviewed ? { source, reviewed } : undefined)
  if (command === 'plan') {
    const out = Path.resolve(required(options, 'out'))
    if (await FileSystem.exists(out)) {
      Errors.ThrowUserInput(`Proposal destination already exists: ${out}`)
    }
    await writeJson(out, selection)
    return {
      proposal: out,
      sourceDiff: `git diff ${selection.sourceHead} ${selection.sourceTree}`,
      reviewedDiff: `git diff ${selection.reviewedHead} ${selection.reviewedTree}`,
    }
  }
  await acceptSelection(session, selection, hooks)
  return { accepted: selection.files, kind: selection.kind }
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
  let current: string | undefined
  for (const arg of args) {
    if (arg.startsWith('--') && known.includes(arg.slice(2))) {
      current = arg.slice(2)
      if (options.has(current)) {
        Errors.ThrowUserInput(`Option repeated: ${arg}`)
      }
      options.set(current, [])
    } else if (current) {
      options.get(current)!.push(arg)
    } else {
      Errors.ThrowUserInput(`Expected a named option, received ${arg}.`)
    }
  }
  return options
}

function single(options: Options, name: string): string | undefined {
  const values = options.get(name)
  if (values && values.length !== 1) {
    Errors.ThrowUserInput(`--${name} requires exactly one value.`)
  }
  return values?.[0]
}

function required(options: Options, name: string): string {
  return single(options, name) ?? Errors.ThrowUserInput(`--${name} is required.`)
}
