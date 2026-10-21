import { Errors } from '@shared'

/** DiffBaseStorage persists an explicit review base for each worktree and working branch. */
export interface DiffBaseStorage {
  get(key: string): string | undefined
  update(key: string, value: string): PromiseLike<void>
}

/** chooseDiffBase uses the approved-branch convention or an explicit override, reporting missing refs. */
export async function chooseDiffBase(
  root: string,
  currentBranch: string | undefined,
  branches: readonly string[],
  storage: DiffBaseStorage,
  pick: (branches: readonly string[], selected: string | undefined) => Promise<string | undefined>,
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
    return Errors.ThrowUserInput(
      base
        ? `Review comparison branch "${base}" does not exist. Use Dev Tao: Change Diff Base to select an existing branch.`
        : 'This worktree has a detached HEAD. Use Dev Tao: Change Diff Base to select an existing branch.',
    )
  }
  const preferred = saved ?? inferred
  const selected = preferred && branches.includes(preferred) ? preferred : branches.find(branch => branch === 'main')
    ?? branches.find(branch => branch === 'origin/main')
  const chosen = await pick(branches, selected)
  if (chosen && branches.includes(chosen)) {
    await storage.update(key, chosen)
    return chosen
  }
  return undefined
}

/** diffArguments compares a selected branch with the current working file, revealing its first change. */
export function diffArguments<Uri>(repoPath: string, base: string, uri: Uri) {
  return { repoPath, lhs: { sha: base, uri }, rhs: { sha: '', uri }, fromComparison: true, range: null }
}
