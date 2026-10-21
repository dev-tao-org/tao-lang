/** DiffBaseStorage persists a review base independently for each Git worktree root. */
export interface DiffBaseStorage {
  get(key: string): string | undefined
  update(key: string, value: string): PromiseLike<void>
}

/** chooseDiffBase reuses a valid saved branch or prompts; cancellation never updates the saved choice. */
export async function chooseDiffBase(
  root: string,
  branches: readonly string[],
  storage: DiffBaseStorage,
  pick: (branches: readonly string[], selected: string | undefined) => Promise<string | undefined>,
  force = false,
): Promise<string | undefined> {
  const key = `reviewBase:${root}`
  const saved = storage.get(key)
  if (!force && saved && branches.includes(saved)) {
    return saved
  }
  const selected = saved && branches.includes(saved) ? saved : branches.find(branch => branch === 'main')
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
