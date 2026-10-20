import { Try } from '@shared'
import { FileSystem, Path, Platform, Repo } from '@shared/os'
import { git } from '../../../../../agents/skills/incremental-review/scripts/ReviewGit'
import { startReview, withReviewLock } from '../../../../../agents/skills/incremental-review/scripts/ReviewSession'
import type { ReviewSession } from '../../../../../agents/skills/incremental-review/scripts/ReviewTypes'

/** ReviewFixture owns a temporary local repository, its reviewed checkout and saved source files. */
export type ReviewFixture = { root: string; session: ReviewSession }

/** withFixture creates local repositories under artifacts and removes only that fixture afterward. */
export async function withFixture(
  files: Record<string, string>,
  action: (fixture: ReviewFixture) => Promise<void>,
  prepare?: (root: string) => Promise<void>,
): Promise<void> {
  const root = Repo.resolvePath('.artifacts/tmp/incremental-review-test', Platform.randomUUID())
  await FileSystem.mkdir(root, { recursive: true })
  await Try(async () => {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', '--local', 'user.name', 'Incremental Review Fixture'])
    await git(root, ['config', '--local', 'user.email', 'incremental-review@example.invalid'])
    await git(root, ['config', '--local', 'core.filemode', 'true'])
    await FileSystem.writeFile(Path.join(root, '.git/info/exclude'), '.artifacts/\n')
    for (const [path, text] of Object.entries(files)) {
      await put(root, path, text)
    }
    await git(root, ['add', '-A'])
    await git(root, ['commit', '-m', 'Fixture baseline'])
    await git(root, ['switch', '-c', 'feat/implementation'])
    await prepare?.(root)
    const session = await withReviewLock(root, () => startReview(root, 'main', 'feat/reviewed-fixture'))
    await action({ root, session })
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
}

/** put saves fixture bytes without staging them. */
export async function put(root: string, path: string, text: string): Promise<void> {
  await FileSystem.mkdir(Path.dirname(Path.join(root, path)), { recursive: true })
  await FileSystem.writeFile(Path.join(root, path), text)
}

/** read reads saved fixture bytes. */
export function read(root: string, path: string): Promise<string> {
  return FileSystem.readFile(Path.join(root, path), 'utf8')
}
