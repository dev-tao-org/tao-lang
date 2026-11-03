import { NewlineCharacter, Try } from '@shared'
import { FS, Path, Platform, Repo } from '@shared/os'
import { git } from '../../../CLIs-src/agent-skills/incremental-review/ReviewGit'
import { startReview, withReviewLock } from '../../../CLIs-src/agent-skills/incremental-review/ReviewSession'
import type { ReviewSession } from '../../../CLIs-src/agent-skills/incremental-review/ReviewTypes'

/** ReviewFixture owns a temporary local repository, its reviewed checkout and saved source files. */
export type ReviewFixture = { root: string; session: ReviewSession }

/** withFixture creates local repositories under artifacts and removes only that fixture afterward. */
export async function withFixture(
  files: Record<string, string>,
  action: (fixture: ReviewFixture) => Promise<void>,
  prepare?: (root: string) => Promise<void>,
): Promise<void> {
  const root = Repo.resolvePath('.artifacts/tmp/incremental-review-test', Platform.randomUUID())
  await FS.mkdir(root)
  await Try(async () => {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', '--local', 'user.name', 'Incremental Review Fixture'])
    await git(root, ['config', '--local', 'user.email', 'incremental-review@example.invalid'])
    await git(root, ['config', '--local', 'core.filemode', 'true'])
    await FS.writeFile(Path.join(root, '.git/info/exclude'), '.artifacts/' + NewlineCharacter)
    for (const [path, text] of Object.entries(files)) {
      await put(root, path, text)
    }
    await git(root, ['add', '-A'])
    await git(root, ['commit', '-m', 'Fixture baseline'])
    await git(root, ['switch', '-c', 'feat/implementation'])
    await prepare?.(root)
    const session = await withReviewLock(
      root,
      () => startReview(root, 'main', 'feat/implementation-incremental-review-approved'),
    )
    await action({ root, session })
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

/** put saves fixture bytes without staging them. */
export async function put(root: string, path: string, text: string): Promise<void> {
  await FS.mkdir(Path.dirname(Path.join(root, path)))
  await FS.writeFile(Path.join(root, path), text)
}

/** read reads saved fixture bytes. */
export function read(root: string, path: string): Promise<string> {
  return FS.readFile(Path.join(root, path), 'utf8')
}
