import { UserInput } from '@shared'

/** OptionalBranchName represents a branch that may not be selected or available. */
export type OptionalBranchName = string | undefined

/** DiffArguments identifies the compared repository revisions and file. */
export type DiffArguments<Uri> = {
  repoPath: string
  lhs: DiffArgumentSide<Uri>
  rhs: DiffArgumentSide<Uri>
  fromComparison: true
  range: null
}

/** DiffBaseStorage persists an explicit review base for each worktree and working branch. */
export interface DiffBaseStorage {
  get(key: string): string | undefined
  update(key: string, value: string): PromiseLike<void>
}

/** chooseDiffBase uses the approved-branch convention or an explicit override, reporting missing refs. */
export async function chooseDiffBase(
  root: string,
  currentBranch: OptionalBranchName,
  branches: readonly string[],
  storage: DiffBaseStorage,
  pick: (branches: readonly string[], selected: OptionalBranchName) => Promise<OptionalBranchName>,
  force = false,
): Promise<string | undefined> {
  const key = `reviewBase:${root}:${currentBranch ?? '<detached>'}`
  const saved = storage.get(key)
  const inferred = currentBranch ? `${currentBranch}-incremental-review-approved` : undefined
  if (!force) {
    const base = saved ?? inferred
    if (base && branches.includes(base)) {
      return base
    }
    return UserInput.fail(
      base
        ? `Review comparison branch "${base}" does not exist. Use Dev Tao: Change Diff Base to select an existing branch.`
        : 'This worktree has a detached HEAD. Use Dev Tao: Change Diff Base to select an existing branch.',
    )
  }
  const preferred = choosePreferredBase(saved, inferred, branches)
  const selected = preferred && branches.includes(preferred) ? preferred : chooseDefaultBase(branches)
  const chosen = await pick(branches, selected)
  if (chosen && branches.includes(chosen)) {
    await storage.update(key, chosen)
    return chosen
  }
  return undefined
}

function choosePreferredBase(
  saved: OptionalBranchName,
  inferred: OptionalBranchName,
  branches: readonly string[],
): OptionalBranchName {
  if (saved !== undefined) {
    return saved
  }
  if (inferred !== undefined) {
    return inferred
  }
  return chooseDefaultBase(branches)
}

function chooseDefaultBase(branches: readonly string[]): OptionalBranchName {
  const localMain = branches.find(branch => branch === 'main')
  if (localMain !== undefined) {
    return localMain
  }
  return branches.find(branch => branch === 'origin/main')
}

/** diffArguments places the comparison branch left of the current working file, preserving addition semantics. */
export function diffArguments<Uri>(repoPath: string, base: string, uri: Uri): DiffArguments<Uri> {
  return { repoPath, lhs: { sha: base, uri }, rhs: { sha: '', uri }, fromComparison: true, range: null }
}

type DiffArgumentSide<Uri> = { sha: string; uri: Uri }
